"""60-minute soak for the 0DTE hub. Run only with IBKR Gateway live.

Usage: python3 scripts/odte_soak.py [--minutes 60] [--out reports/]
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "http://127.0.0.1:8788"
SYMBOLS = ["SPY", "QQQ", "IWM", "DIA", "SPX", "NDX", "RUT", "DJX"]


def _get(path: str) -> dict:
    with urllib.request.urlopen(f"{BASE}{path}", timeout=5) as r:
        return json.load(r)


def _post_symbol(symbol: str) -> dict:
    req = urllib.request.Request(
        f"{BASE}/control/symbol",
        data=json.dumps({"symbol": symbol}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--minutes", type=int, default=60)
    ap.add_argument("--out", default="reports")
    args = ap.parse_args()

    polls: list[dict] = []
    switches: list[dict] = []
    t_end = time.time() + args.minutes * 60
    rotation = [s for s in SYMBOLS for _ in (0,)]  # one pass, ~7.5 min dwell at 60 min
    next_switch = time.time()
    sym_iter = iter(rotation)

    while time.time() < t_end:
        now = datetime.now(timezone.utc).isoformat()
        try:
            h = _get("/health")
            polls.append({"ts": now, **h})
        except Exception as exc:  # noqa: BLE001 — soak must record, not die
            polls.append({"ts": now, "ok": False, "error": str(exc)})
        if time.time() >= next_switch:
            try:
                sym = next(sym_iter)
                resp = _post_symbol(sym)
                switches.append({"ts": now, "requested": sym, "resp": resp})
                next_switch = time.time() + (args.minutes * 60) / len(rotation)
            except StopIteration:
                next_switch = t_end + 1
            except Exception as exc:  # noqa: BLE001
                switches.append({"ts": now, "requested": sym, "error": str(exc)})
        time.sleep(15)

    ok_polls = [p for p in polls if p.get("ok")]
    connected = [p for p in polls if p.get("ibkr_connected")]
    verdict = {
        "polls": len(polls),
        "ok_rate": len(ok_polls) / max(len(polls), 1),
        "connected_rate": len(connected) / max(len(polls), 1),
        "switches": switches,
        "pass": len(ok_polls) == len(polls)
        and len(connected) / max(len(polls), 1) >= 0.99
        and all("error" not in s for s in switches),
    }
    out = Path(args.out) / f"odte_soak_{datetime.now():%Y%m%d_%H%M}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({"verdict": verdict, "polls": polls}, indent=1))
    print(json.dumps(verdict["pass"] and "SOAK PASS" or "SOAK FAIL"))
    print(f"report: {out}")
    return 0 if verdict["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
