"""Exit premise-check (design spec 2026-06-29). Extracts baseline trades into enriched held
paths, sizes the oracle ceiling, applies the exit-overlay family, and runs a paired
name-cluster aggregate-level bootstrap -> conjunction p (max(p_mar,p_exp)) -> Holm over the
candidate rules -> premise_check_report.json. Reuses metrics.aggregate (NOT beats_baseline).

INFERENCE (pre-registered): pooled OOS 2021-2024; name-cluster paired bootstrap n_boot=2000;
p_rule=max(p_mar,p_exp); >=30 active trades else ABSTAIN; Holm over candidate rules only;
GO iff >=1 candidate wins; per-year deltas are a non-gating regime annotation."""
import os
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

from ..db import get_conn
from ..indicators.compute import _atr
from .schema import ensure_schema
from .replay import replay
from .metrics import aggregate
from .evalstats import holm
from .exits import RULES, CONTROL, realized_r

CANDIDATES = list(RULES)
OOS_YEARS = (2021, 2022, 2023, 2024)
MIN_TRADES = 30
N_BOOT = 2000


def _enrich(daily: pd.DataFrame) -> pd.DataFrame:
    d = daily.copy()
    d["atr14"] = _atr(d["high"], d["low"], d["close"], 14)
    d["donch_low20"] = d["low"].rolling(20).min().shift(1)
    return d


def extract_trades(ticker, daily, spy, *, replay_fn=replay) -> list:
    d = _enrich(daily)
    idx = d.index
    fd, tmp = tempfile.mkstemp(suffix=".db"); os.close(fd)
    conn = get_conn(tmp)
    try:
        ensure_schema(conn)
        replay_fn(conn, ticker=ticker, daily=daily, spy=spy, sector=None,
                  model_ver="bt", run_kind="backtest", mode="paper")
        trows = conn.execute(
            "SELECT entry_ts, entry_px, init_stop, exit_ts, r_multiple FROM trades "
            "WHERE ticker=? AND exit_ts IS NOT NULL ORDER BY entry_ts", (ticker,)).fetchall()
        flags = {r["ts"]: (r["health_flags"] or "") for r in conn.execute(
            "SELECT ts, health_flags FROM position_signals WHERE ticker=? AND overlay='LONG'",
            (ticker,))}
    finally:
        conn.close(); os.unlink(tmp)

    out = []
    for t in trows:
        e, x = pd.Timestamp(t["entry_ts"]), pd.Timestamp(t["exit_ts"])
        if e not in idx or x not in idx:
            continue
        ep, xp = idx.get_loc(e), idx.get_loc(x)
        r = float(t["entry_px"]) - float(t["init_stop"])
        if r <= 0:
            continue
        path = d.iloc[ep:xp + 1].copy()
        path["health_flags"] = [flags.get(str(ts.date()), "") for ts in path.index]
        out.append({"ticker": ticker, "entry_ts": e, "entry_px": float(t["entry_px"]),
                    "r": r, "hold_r": float(t["r_multiple"]),
                    "mfe_r": float((path["high"].max() - float(t["entry_px"])) / r),
                    "path": path})
    return out


def _metrics(r_values, years) -> tuple:
    """(MAR, expectancy) for an entry-date-ordered R list, via metrics.aggregate. bh/spy args
    are 0 (they only feed mar_vs_* fields, not mar). n_bars feeds exposure only (unused here)."""
    r = list(r_values)
    df = pd.DataFrame({"r_multiple": r, "holding_bars": [1] * len(r)})
    m = aggregate(df, n_bars=max(len(r), 1), years=years, bh_return=0.0, bh_maxdd=0.0,
                  spy_return=0.0, spy_maxdd=0.0)
    return float(m["mar"]), float(m["expectancy"])


def oracle_ceiling(trades, years) -> dict:
    s = sorted(trades, key=lambda t: t["entry_ts"])
    h_mar, h_exp = _metrics([t["hold_r"] for t in s], years)
    o_mar, o_exp = _metrics([max(t["hold_r"], t["mfe_r"]) for t in s], years)
    return {"hold_mar": h_mar, "hold_exp": h_exp, "oracle_mar": o_mar, "oracle_exp": o_exp,
            "uplift_mar": o_mar - h_mar, "uplift_exp": o_exp - h_exp}


def bootstrap_rule(df, years, *, n_boot=N_BOOT, seed=0, min_rep=10) -> dict:
    """Paired name-cluster bootstrap of the (rule - hold) MAR and expectancy deltas. Each
    replicate resamples whole names with replacement, sorts by entry date, and recomputes MAR
    via aggregate() on both the rule and hold R-series (paired). One-sided p = P(delta <= 0)."""
    names = df["ticker"].unique()
    rng = np.random.default_rng(seed)
    dmar, dexp = [], []
    for _ in range(n_boot):
        drawn = rng.choice(names, size=len(names), replace=True)
        rs = pd.concat([df[df["ticker"] == nm] for nm in drawn]).sort_values("entry_ts")
        if len(rs) < min_rep:
            continue
        mar_r, _ = _metrics(rs["rule_r"].tolist(), years)
        mar_h, _ = _metrics(rs["hold_r"].tolist(), years)
        dmar.append(mar_r - mar_h)
        dexp.append(float((rs["rule_r"] - rs["hold_r"]).mean()))
    dmar, dexp = np.asarray(dmar, float), np.asarray(dexp, float)
    if dmar.size == 0:
        return {"p_mar": 1.0, "p_exp": 1.0, "p_rule": 1.0, "ci_mar": (np.nan, np.nan),
                "ci_exp": (np.nan, np.nan)}
    p_mar, p_exp = float(np.mean(dmar <= 0)), float(np.mean(dexp <= 0))
    return {"p_mar": p_mar, "p_exp": p_exp, "p_rule": max(p_mar, p_exp),
            "ci_mar": (float(np.quantile(dmar, 0.025)), float(np.quantile(dmar, 0.975))),
            "ci_exp": (float(np.quantile(dexp, 0.025)), float(np.quantile(dexp, 0.975)))}


def apply_rules(trades) -> pd.DataFrame:
    allrules = {**RULES, **CONTROL}
    rows = []
    for i, t in enumerate(trades):
        for name, fn in allrules.items():
            off = fn(t["path"], t["entry_px"], t["r"])
            rr = realized_r(t["path"], t["entry_px"], t["r"], off, t["hold_r"])
            active = off is not None and off + 1 < len(t["path"])
            rows.append({"trade": i, "ticker": t["ticker"], "entry_ts": t["entry_ts"],
                         "rule": name, "rule_r": rr, "hold_r": t["hold_r"],
                         "exit_offset": -1 if off is None else int(off), "active": bool(active)})
    return pd.DataFrame(rows)


def rule_correlation(apply_df) -> dict:
    cand = set(CANDIDATES)
    rules = [r for r in sorted(apply_df["rule"].unique()) if r in cand]
    df = apply_df.copy()
    df.loc[~df["active"], "exit_offset"] = np.nan      # non-firing -> NaN so dropna drops it
    piv = df.pivot(index="trade", columns="rule", values="exit_offset")
    out = {}
    for i, a in enumerate(rules):
        for b in rules[i + 1:]:
            both = piv[[a, b]].dropna()                  # only trades where BOTH fired
            agree = ((both[a] - both[b]).abs() <= 1).mean() if len(both) else 0.0
            out[f"{a}|{b}"] = float(agree)
    return out


def _git_sha() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    except Exception:
        return "unknown"


def evaluate(apply_df, years, *, n_boot=N_BOOT, seed=0) -> tuple:
    res, pvals = {}, {}
    for name in CANDIDATES + list(CONTROL):
        sub = apply_df[apply_df["rule"] == name]
        n_active = int(sub["active"].sum())
        if n_active < MIN_TRADES:
            res[name] = {"status": "ABSTAIN_LOW_N", "n_active": n_active}
            continue
        bs = bootstrap_rule(sub[["ticker", "entry_ts", "rule_r", "hold_r"]], years,
                            n_boot=n_boot, seed=seed)
        res[name] = {"status": "OK", "n_active": n_active, **bs}
        if name in CANDIDATES:
            pvals[name] = bs["p_rule"]
    rej = holm(pvals, alpha=0.05) if pvals else {}
    for name in CANDIDATES:
        if res[name].get("status") == "OK":
            res[name]["holm_win"] = bool(rej.get(name, False))
    go = any(res[n].get("holm_win") for n in CANDIDATES)
    return res, go


def _year_deltas(apply_df, name, years_each=1.0) -> dict:
    sub = apply_df[apply_df["rule"] == name]
    out = {}
    for y in OOS_YEARS:
        g = sub[sub["entry_ts"].dt.year == y].sort_values("entry_ts")
        if len(g) < 5:
            continue
        mar_r, exp_r = _metrics(g["rule_r"].tolist(), years_each)
        mar_h, exp_h = _metrics(g["hold_r"].tolist(), years_each)
        out[str(y)] = {"d_mar": mar_r - mar_h, "d_exp": exp_r - exp_h}
    return out


def run_premise(*, corpus_dir, membership_path, out_dir=None, names=None,
                fetch_prices=None, seed=0) -> dict:
    """Live orchestration. `fetch_prices(name)->daily` defaults to reading corpus_dir/corpus.db;
    `names` defaults to all corpus tickers. Pools OOS 2021-2024 trades, evaluates, writes report."""
    from .corpus import load_prices
    out_dir = Path(out_dir) if out_dir is not None else Path(corpus_dir)
    conn = get_conn(Path(corpus_dir) / "corpus.db")
    # membership_path accepted for interface parity with run_corpus/run_evaluation; intentionally unused
    try:
        if names is None:
            names = [r["ticker"] for r in conn.execute(
                "SELECT DISTINCT ticker FROM prices ORDER BY ticker") if r["ticker"] != "SPY"]
        fetch_prices = fetch_prices or (lambda nm: load_prices(conn, nm, start="2014-01-01", end="2024-12-31"))
        spy = load_prices(conn, "SPY", start="2014-01-01", end="2024-12-31")

        trades = []
        for nm in names:
            d = fetch_prices(nm)
            if d is None or len(d) < 60:
                continue
            trades.extend(extract_trades(nm, d, spy))
    finally:
        conn.close()

    oos = [t for t in trades if t["entry_ts"].year in OOS_YEARS]
    years = float(len(OOS_YEARS))
    apply_df = apply_rules(oos)
    res, go = evaluate(apply_df, years, seed=seed)
    for name in CANDIDATES:
        if res[name].get("holm_win"):
            yd = _year_deltas(apply_df, name)
            pos = sum(1 for v in yd.values() if v["d_mar"] > 0 and v["d_exp"] > 0)
            res[name]["per_year"] = yd
            res[name]["regime_robust"] = bool(pos >= 3)
    report = {"window": "2021-2024", "n_trades_oos": len(oos), "n_names": len(names),
              "years": years, "oracle": oracle_ceiling(oos, years) if oos else {},
              "rule_correlation": rule_correlation(apply_df) if len(apply_df) else {},
              "verdict": "GO" if go else "NO-GO", "rules": res,
              "preregistration_sha": _git_sha()}
    (out_dir / "premise_check_report.json").write_text(
        __import__("json").dumps(report, indent=2, default=float))
    return report
