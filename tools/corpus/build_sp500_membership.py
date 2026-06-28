"""One-shot: reconstruct point-in-time S&P 500 membership from Wikipedia and write
config/sp500_membership.json. Run by hand (network); the JSON is the committed artifact
that argus.position_engine.corpus reads. Uses requests + bs4 (stdlib html.parser) —
NOT pd.read_html (lxml/html5lib absent)."""
import json
import re
import datetime as _dt
from pathlib import Path

import requests
from bs4 import BeautifulSoup

URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
START_YEAR = 2014
BENCHMARKS = ["SPY", "XLK", "XLF", "XLV", "XLY", "XLC", "XLI", "XLP", "XLE", "XLB", "XLRE", "XLU"]
OUT = Path(__file__).resolve().parents[2] / "config" / "sp500_membership.json"


def _soup() -> BeautifulSoup:
    r = requests.get(URL, headers={"User-Agent": "argus-corpus/1.0"}, timeout=30)
    r.raise_for_status()
    return BeautifulSoup(r.text, "html.parser")


def _current_members(soup) -> set:
    table = soup.find("table", {"id": "constituents"})
    out = set()
    for row in table.find("tbody").find_all("tr")[1:]:
        cells = row.find_all("td")
        if cells:
            out.add(cells[0].get_text(strip=True).replace(".", "-"))   # BRK.B -> BRK-B (yf)
    return out


def _changes(soup):
    """Yield (date, added_ticker_or_None, removed_ticker_or_None), newest-first, as the
    'Selected changes to the list' table is ordered."""
    table = soup.find("table", {"id": "changes"})
    for row in table.find("tbody").find_all("tr"):
        cells = row.find_all(["td", "th"])
        txt = [c.get_text(strip=True) for c in cells]
        m = re.search(r"[A-Z][a-z]+ \d{1,2}, \d{4}", " ".join(txt[:2]))
        if not m:
            continue
        d = _dt.datetime.strptime(m.group(0), "%B %d, %Y").date()
        # Wikipedia columns: Date | Added(ticker, name) | Removed(ticker, name) | Reason
        added = txt[1].replace(".", "-") if len(txt) > 1 and txt[1] else None
        removed = txt[3].replace(".", "-") if len(txt) > 3 and txt[3] else None
        yield d, added or None, removed or None


def reconstruct() -> dict:
    soup = _soup()
    current = _current_members(soup)
    intervals = {t: [[None, None]] for t in current}   # start unknown yet, end=None
    active = set(current)
    for d, added, removed in _changes(soup):                            # newest-first
        iso = d.isoformat()
        if added and added in active:        # this add is when `added` STARTED its current stint
            for iv in intervals[added]:
                if iv[1] is None and iv[0] is None:
                    iv[0] = iso
            active.discard(added)
        if removed:                          # `removed` was a member UNTIL this date -> reopen
            intervals.setdefault(removed, []).append([None, iso])
            active.add(removed)
    # any still-active with unknown start began before our data window
    for t in list(intervals):
        for iv in intervals[t]:
            if iv[0] is None:
                iv[0] = f"{START_YEAR}-01-01"
    # drop intervals entirely before START_YEAR; coerce shape
    members = {}
    for t, ivs in intervals.items():
        keep = [[s, e] for s, e in ivs if (e is None or e >= f"{START_YEAR}-01-01")]
        if keep:
            members[t] = keep
    return {"_benchmarks": BENCHMARKS, "members": members}


def main():
    data = reconstruct()
    OUT.write_text(json.dumps(data, indent=2, sort_keys=True))
    print(f"wrote {OUT} — {len(data['members'])} members + {len(data['_benchmarks'])} benchmarks")


if __name__ == "__main__":
    main()
