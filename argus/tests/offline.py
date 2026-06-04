"""Offline validation. No network required.

Generates a synthetic OHLCV DataFrame and exercises every local code path:
indicators, agents, action card, backtest, monte carlo, hedge math, journal,
FastAPI app build, and MCP server build.

Run: python tests/offline.py
"""
from __future__ import annotations

import logging
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

# Quiet down yfinance noise — two agents try SPY / ^VIX which fails offline.
logging.getLogger("yfinance").setLevel(logging.CRITICAL)
os.environ.setdefault("PYTHONWARNINGS", "ignore")

# Redirect data_dir + db to a writable tempdir BEFORE importing argus.settings.
_TMPDIR = tempfile.mkdtemp(prefix="argus_test_")
os.environ.setdefault("DATA_DIR", _TMPDIR)
os.environ.setdefault("DB_PATH", str(Path(_TMPDIR) / "argus.db"))

import numpy as np
import pandas as pd
from rich.console import Console
from rich.table import Table


def synth_ohlcv(n: int = 400, seed: int = 7) -> pd.DataFrame:
    """Synthetic geometric-Brownian-motion price series with intra-bar OHLC."""
    rng = np.random.default_rng(seed)
    rets = rng.normal(loc=0.0005, scale=0.015, size=n)
    close = 100 * np.exp(np.cumsum(rets))
    # Build OHLC from close path with a bit of intrabar noise.
    noise = rng.normal(0, 0.5, size=(n, 2))
    high = close * (1 + np.abs(rng.normal(0, 0.008, n)))
    low = close * (1 - np.abs(rng.normal(0, 0.008, n)))
    open_ = np.r_[close[0], close[:-1]] * (1 + rng.normal(0, 0.002, n))
    volume = rng.integers(1_000_000, 10_000_000, size=n).astype(float)
    idx = pd.date_range("2024-01-01", periods=n, freq="B")
    df = pd.DataFrame(
        {
            "open": open_,
            "high": np.maximum.reduce([open_, close, high]),
            "low": np.minimum.reduce([open_, close, low]),
            "close": close,
            "volume": volume,
        },
        index=idx,
    )
    df.index.name = "ts"
    return df


def main() -> None:
    console = Console()
    console.rule("[bold]Argus — offline validation[/bold]")

    df = synth_ohlcv(420)
    console.print(f"[green]✓[/green] synthetic OHLCV: {len(df)} bars")

    # Indicators
    from argus.indicators import compute_all, INDICATOR_LIST
    ind = compute_all(df)
    available = [c for c in INDICATOR_LIST if c in ind.columns]
    console.print(
        f"[green]✓[/green] indicators computed: {len(available)} / {len(INDICATOR_LIST)} catalogue entries"
    )
    missing = [c for c in INDICATOR_LIST if c not in ind.columns]
    if missing:
        console.print(f"   [yellow]missing:[/yellow] {missing}")

    # Agents
    from argus.agents import all_agents, run_all
    agents = all_agents()
    console.print(f"[green]✓[/green] agents registered: {len(agents)}")
    votes = run_all(ind)
    long_n = sum(1 for v in votes if v.verdict.value == "LONG")
    short_n = sum(1 for v in votes if v.verdict.value == "SHORT")
    wait_n = sum(1 for v in votes if v.verdict.value == "WAIT")
    console.print(f"   votes: L={long_n}  S={short_n}  W={wait_n}")

    # Action card
    from argus.action_card import build_action_card
    card = build_action_card("SYN", ind)
    console.print(
        f"[green]✓[/green] action card: [bold]{card.verdict.value}[/bold] "
        f"score={card.score:+.3f} agree={card.agreement_pct:.0f}% "
        f"{'⚡HC' if card.high_conviction else ''}"
    )
    console.print(
        f"   entry={card.entry:.2f}  stop={card.stop:.2f}  "
        f"target={card.target:.2f}  RR={card.risk_reward:.2f}"
    )

    # Backtest
    from argus.backtest import backtest_signal, monte_carlo
    bt = backtest_signal("SYN", ind)
    console.print(
        f"[green]✓[/green] backtest: {bt.trades} trades  "
        f"win_rate={bt.win_rate*100:.0f}%  PF={bt.profit_factor:.2f}  "
        f"Sharpe={bt.sharpe:.2f}  MDD={bt.max_drawdown*100:.1f}%"
    )

    # Monte Carlo (skip if no trades)
    if bt.trade_returns:
        mc = monte_carlo(bt.trade_returns, sims=2000)
        console.print(
            f"[green]✓[/green] monte carlo: p5={mc.p5:.2f}  p50={mc.p50:.2f}  p95={mc.p95:.2f}  "
            f"P(loss)={mc.prob_loss*100:.0f}%  P(ruin)={mc.prob_ruin*100:.0f}%"
        )
    else:
        console.print("[yellow]–[/yellow] monte carlo skipped (no trades in synthetic series)")

    # Pre-trade stress
    from argus.backtest.monte_carlo import pre_trade_stress
    stress = pre_trade_stress(card.entry, card.stop, card.target, 0.55)
    console.print(
        f"[green]✓[/green] pre-trade stress: P(stop)={stress['prob_stop']*100:.0f}%  "
        f"E[ret]={stress['expected_pct_return']:+.2f}%"
    )

    # Hedge calc — uses constants only, no network required
    from argus.portfolio.hedge import INVERSE_ETFS
    console.print(f"[green]✓[/green] hedge ETF map: {list(INVERSE_ETFS.keys())}")

    # Journal
    from argus.journal import Journal, Trade
    from datetime import datetime, timezone
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    j = Journal(path=tmp.name)
    tid = j.open_trade(Trade(
        id=None,
        ts=datetime.now(timezone.utc).isoformat(),
        symbol="SYN", side="LONG", qty=10,
        entry=card.entry, stop=card.stop, target=card.target,
        exit=None, pnl=None, rr=None, status="OPEN",
    ))
    j.close_trade(tid, card.target)
    stats = j.stats()
    console.print(f"[green]✓[/green] journal: {stats['trades']} closed, total_pnl={stats['total_pnl']:.2f}")

    # FastAPI build
    from argus.api import build_app
    app = build_app()
    routes = [r.path for r in app.routes if hasattr(r, "path")]
    console.print(f"[green]✓[/green] FastAPI app built: {len(routes)} routes")

    # MCP server build
    from argus.mcp_server import build_mcp
    mcp = build_mcp()
    console.print(f"[green]✓[/green] MCP server built: name='{mcp.name}'")

    # Show first 5 indicator values for the latest bar
    tbl = Table(show_header=True, header_style="dim", title="Latest bar snapshot")
    tbl.add_column("Indicator"); tbl.add_column("Value", justify="right")
    sample = ["close", "ema_20", "ema_50", "rsi_14", "macd_hist", "atr_14",
              "adx_14", "supertrend_dir", "ttm_squeeze", "obv"]
    last = ind.iloc[-1]
    for name in sample:
        if name in ind.columns:
            v = last[name]
            tbl.add_row(name, f"{v:.4f}" if isinstance(v, (int, float, np.floating)) else str(v))
    console.print(tbl)

    console.rule("[bold green]OFFLINE CHECKS PASSED[/bold green]")


if __name__ == "__main__":
    main()
