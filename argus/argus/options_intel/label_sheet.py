"""Blind labelling sheet for scorer validation (master plan WS-1.2 acceptance).

Usage (after >=5 sessions of close snapshots):
    python -m argus.options_intel.label_sheet /tmp/unusual_validation.csv

Mixes the top-N scored contracts with N random eligible-but-unscored contracts,
shuffled, WITHOUT score columns — the human labels each row unusual y/n blind,
then compares against the scorer's verdicts.
"""
import csv
import random
import sys

from ..db import get_conn
from .schema import ensure_schema
from .unusual import MIN_OI


def write_sheet(conn, path, top_n: int = 20, random_n: int = 20, seed: int | None = None):
    top = conn.execute(
        "SELECT snap_date,symbol,contract,vol,oi,last FROM unusual_activity "
        "ORDER BY score DESC LIMIT ?", (top_n,)).fetchall()
    scored = {r["contract"] for r in top}
    pool = [r for r in conn.execute(
        "SELECT snap_date,symbol,expiry,strike,type,vol,oi,last FROM options_snapshots "
        "WHERE kind='close' AND oi>=? ORDER BY snap_date DESC LIMIT 2000",
        (MIN_OI,)).fetchall()
        if f"{r['symbol']} {r['expiry']} {r['strike']:g}{r['type']}" not in scored]
    rng = random.Random(seed)
    sample = rng.sample(pool, min(random_n, len(pool)))
    rows = ([dict(snap_date=r["snap_date"], symbol=r["symbol"], contract=r["contract"],
                  vol=r["vol"], oi=r["oi"], last=r["last"]) for r in top]
            + [dict(snap_date=r["snap_date"], symbol=r["symbol"],
                    contract=f"{r['symbol']} {r['expiry']} {r['strike']:g}{r['type']}",
                    vol=r["vol"], oi=r["oi"], last=r["last"]) for r in sample])
    rng.shuffle(rows)
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["snap_date", "symbol", "contract", "vol", "oi",
                                          "last", "label_unusual_yn", "notes"])
        w.writeheader()
        for r in rows:
            w.writerow({**r, "label_unusual_yn": "", "notes": ""})


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: python -m argus.options_intel.label_sheet <out.csv>", file=sys.stderr)
        return 2
    conn = get_conn()
    ensure_schema(conn)
    write_sheet(conn, sys.argv[1])
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
