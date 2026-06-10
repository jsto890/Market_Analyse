"""Shared contract for the weight-optimisation panel.

panel.csv is the single interface between the dataset builder and the
grid-search / regression consumers. Columns are fixed here so the producers
and consumers cannot drift.
"""
from __future__ import annotations

# Forward-return horizons in TRADING days. 126/252 are intentionally absent:
# the dataset spans ~33 calendar days, so only short horizons have elapsed.
FORWARD_HORIZONS = [1, 5, 10, 20]

# Per-sub-agent catalyst vote confidences (signed). Logged from 2026-06-09;
# empty for older rows. Used by vote_validation.py at the 6-week checkpoint.
VOTE_COLUMNS = [
    "vote_event_catalyst",
    "vote_earnings_proximity",
    "vote_squeeze_setup",
    "vote_growth_profitability",
    "vote_analyst_upside",
]

PANEL_COLUMNS = [
    "date",             # ISO YYYY-MM-DD, parsed from the bridge filename
    "ticker",           # upper-case
    "fetch_symbol",     # symbol used to fetch prices (alias-aware)
    "sentiment_score",  # point-in-time, as stored in the bridge CSV (-1..+1)
    "tech_score",       # point-in-time, as stored (-1..+1)
    "catalyst_score",   # -1..+1 or empty (only present from 2026-06-09)
    "alignment",        # ALIGNED / TECH_WAIT / DIVERGING / CONTRARIAN / NEUTRAL
    "gate_flags",       # catalyst gate flags string (may be empty)
    "n_runs_date",      # provenance: how many bridge runs existed that date
    "source_file",      # provenance: which CSV this row came from
] + VOTE_COLUMNS + [f"fwd_ret_{h}d" for h in FORWARD_HORIZONS]

# Historical schema drift: oldest CSVs used signa_* before the package rename.
COLUMN_ALIASES = {
    "signa_verdict": "argus_verdict",
    "signa_score": "argus_score",
}
