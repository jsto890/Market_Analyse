from datetime import datetime
from argus.report.morning import build_report, render_markdown, tone_label


def _now():
    return datetime(2026, 6, 17, 8, 0, 0)


GAUGES = [
    {"scope": "us", "window": "1d", "score": 0.12, "n": 20},
    {"scope": "global", "window": "1d", "score": 0.03, "n": 50},
    {"scope": "us", "window": "1h", "score": -0.4, "n": 3},  # ignored (not 1d)
]
EVENTS = [
    {"date": "2026-06-17", "time_et": "14:00", "event": "FOMC rate decision",
     "category": "fomc", "importance": "high", "source": "seed", "ticker": None},
    {"date": "2026-06-18", "time_et": "08:30", "event": "Initial Jobless Claims",
     "category": "jobs", "importance": "medium", "source": "seed", "ticker": None},
    {"date": "2026-06-25", "time_et": None, "event": "MU earnings",
     "category": "earnings", "importance": "medium", "source": "earnings", "ticker": "MU"},
]
HEADLINES = [
    {"headline": "Chips rally on AI demand", "ticker": "NVDA", "source": "discord", "is_breaking": 0},
    {"headline": "Fed expected to hold", "ticker": None, "source": "discord", "is_breaking": 1},
]
FUTURES = [{"symbol": "ES=F", "change_pct": 0.31}, {"symbol": "NQ=F", "change_pct": 0.52}]


def test_tone_label_boundaries():
    assert tone_label(-0.5) == "bearish"
    assert tone_label(-0.1) == "cautious"
    assert tone_label(0.0) == "neutral"
    assert tone_label(0.12) == "constructive"
    assert tone_label(0.5) == "bullish"


def test_build_report_splits_and_filters():
    r = build_report(_now(), GAUGES, EVENTS, HEADLINES, FUTURES)
    assert r["date"] == "2026-06-17" and r["weekday"] == "Wednesday"
    assert "US macro tone reads **constructive** (+0.12)" in r["tone"]
    assert "global **neutral** (+0.03)" in r["tone"]
    assert "FOMC rate decision" in r["tone"]            # high-impact today surfaced
    assert [e["event"] for e in r["earnings"]] == ["MU earnings"]
    assert "FOMC rate decision" in [e["event"] for e in r["macro_events"]]
    assert all(e["category"] != "earnings" for e in r["macro_events"])
    assert len(r["today_events"]) == 1                  # only the 06-17 FOMC


def test_render_markdown_has_sections():
    md = render_markdown(build_report(_now(), GAUGES, EVENTS, HEADLINES, FUTURES))
    assert md.startswith("## Morning Brief — 2026-06-17 (Wednesday)")
    assert "**Futures:** ES=F +0.31% · NQ=F +0.52%" in md
    assert "**What to expect:**" in md
    assert "**Earnings (tracked):**" in md and "MU" in md
    assert "**Headlines:**" in md
    assert "🔴 Fed expected to hold" in md              # breaking marker
    assert "$NVDA Chips rally on AI demand" in md       # ticker prefix


def test_build_report_handles_empty():
    r = build_report(_now(), [], [], [], [])
    assert "**neutral** (+0.00)" in r["tone"]
    md = render_markdown(r)
    assert md.startswith("## Morning Brief")
