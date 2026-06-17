"""Pure scope classifier (master plan §WS-3.3): a news item rolls up into one or
more macro scopes — always 'global'; 'us' for US-macro keywords or any (US-listed)
ticker; and 'sector:<family>' for tickers we can map. Sector family via the
existing sector_taxonomy. No I/O beyond resolve_sector's own cache."""
import re

from ..sector_taxonomy import resolve_sector

GLOBAL = "global"
US = "us"

# US-macro signal words → the print drives US (and therefore global) sentiment.
_US_MACRO = re.compile(
    r"\b(fed|fomc|powell|cpi|ppi|inflation|disinflation|jobs?|payrolls?|nfp|"
    r"unemployment|jobless|gdp|pce|rate\s?(?:cut|hike|s)?|interest rate|treasur|"
    r"yields?|recession|tariff|debt ceiling|consumer confidence|retail sales)\b",
    re.IGNORECASE,
)


def scopes_for(ticker, headline: str) -> set[str]:
    s = {GLOBAL}
    text = headline or ""
    if _US_MACRO.search(text):
        s.add(US)
    if ticker:
        s.add(US)  # tracked universe is US-listed
        try:
            family, _ = resolve_sector(ticker)
        except Exception:
            family = "Other"
        if family and family != "Other":
            s.add(f"sector:{family}")
    return s
