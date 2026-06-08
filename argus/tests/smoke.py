"""End-to-end smoke test. Doesn't require IBKR — only yfinance.

Run: python tests/smoke.py
"""
from __future__ import annotations

import sys
from pathlib import Path

# Make sure we can import the package without installing it.
sys.path.insert(0, str(Path(__file__).parent.parent))

from rich import print as rprint  # type: ignore
from rich.table import Table
from rich.console import Console


def main() -> None:
    console = Console()
    console.rule("[bold]Argus — smoke test[/bold]")

    # 1. Data
    from argus.data import get_history, get_quote
    df = get_history("AAPL", period="1y", interval="1d")
    assert not df.empty, "no AAPL data"
    console.print(f"[green]✓[/green] yfinance history: {len(df)} bars of AAPL")

    q = get_quote("AAPL")
    assert q and q["price"] > 0
    console.print(f"[green]✓[/green] quote: AAPL ${q['price']:.2f} ({q['change_pct']:+.2f}%)")

    # 2. Indicators
    from argus.indicators import compute_all, INDICATOR_LIST
    ind = compute_all(df)
    available = [c for c in INDICATOR_LIST if c in ind.columns]
    console.print(f"[green]✓[/green] indicators computed: {len(available)} / {len(INDICATOR_LIST)}")

    # 3. Agents
    from argus.agents import all_agents, run_all
    agents = all_agents()
    console.print(f"[green]✓[/green] agents registered: {len(agents)}")
    votes = run_all(ind)
    long_n = sum(1 for v in votes if v.verdict.value == "LONG")
    short_n = sum(1 for v in votes if v.verdict.value == "SHORT")
    wait_n = sum(1 for v in votes if v.verdict.value == "WAIT")
    console.print(f"   votes: L={long_n}  S={short_n}  W={wait_n}")

    # 4. Action card
    from argus.action_card import build_action_card
    card = build_action_card("AAPL", ind)
    console.print(
        f"[green]✓[/green] action card: [bold]{card.verdict.value}[/bold] "
        f"score={card.score:+.3f} agree={card.agreement_pct:.0f}% "
        f"{'⚡HC' if card.high_conviction else ''}"
    )
    console.print(f"   entry={card.entry:.2f}  stop={card.stop:.2f}  target={card.target:.2f}  RR={card.risk_reward:.2f}")

    # 5. Flow (yfinance options chain — best-effort)
    from argus.flow import flow_summary
    try:
        flow = flow_summary("AAPL")
        if "error" not in flow:
            console.print(
                f"[green]✓[/green] flow: PCR_vol={flow['summary']['pcr_vol']:.2f}  "
                f"flags={flow['flags'] or '—'}"
            )
        else:
            console.print(f"[yellow]–[/yellow] flow unavailable: {flow.get('error')}")
    except Exception as e:
        console.print(f"[yellow]–[/yellow] flow error (non-fatal): {e}")

    # 6. Screener (small universe to keep test snappy)
    from argus.screener import screen_universe
    cards = screen_universe(["AAPL", "MSFT", "NVDA", "SPY", "QQQ"], min_conviction=0.0)
    console.print(f"[green]✓[/green] screener: {len(cards)} cards")
    tbl = Table(show_header=True, header_style="dim")
    tbl.add_column("Symbol"); tbl.add_column("Verdict"); tbl.add_column("Score"); tbl.add_column("Agreement")
    for c in cards[:5]:
        tbl.add_row(c.symbol, c.verdict.value, f"{c.score:+.2f}", f"{c.agreement_pct:.0f}%")
    console.print(tbl)

    # 12. API surface (just import, don't bind to a port)
    from argus.api import build_app
    app = build_app()
    routes = [r.path for r in app.routes if hasattr(r, "path")]
    console.print(f"[green]✓[/green] FastAPI app built: {len(routes)} routes")

    # 13. MCP server (build only)
    from argus.mcp_server import build_mcp
    mcp = build_mcp()
    console.print(f"[green]✓[/green] MCP server built: name='{mcp.name}'")

    console.rule("[bold green]ALL CHECKS PASSED")


if __name__ == "__main__":
    main()
