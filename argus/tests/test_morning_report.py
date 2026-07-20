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


DAY_AHEAD_EVENTS = EVENTS + [
    {"date": "2026-06-17", "time_et": "08:00", "event": "OKLO earnings",
     "category": "earnings", "importance": "medium", "source": "earnings", "ticker": "OKLO"},
    {"date": "2026-06-17", "time_et": "16:30", "event": "AAPL earnings",
     "category": "earnings", "importance": "medium", "source": "earnings", "ticker": "AAPL"},
    {"date": "2026-06-18", "time_et": None, "event": "SMR earnings",
     "category": "earnings", "importance": "medium", "source": "earnings", "ticker": "SMR"},
]
DAY_AHEAD_FUTURES = FUTURES + [{"symbol": "RTY=F", "change_pct": -0.22}]


def test_day_ahead_earnings_split_session_and_rank():
    r = build_report(_now(), GAUGES, DAY_AHEAD_EVENTS, HEADLINES, DAY_AHEAD_FUTURES,
                     watchlist={"OKLO", "SMR"})
    da = r["day_ahead"]
    today = da["earnings_today"]
    # Watchlist name ranks first even though AAPL sorts later in input order
    assert [e["ticker"] for e in today] == ["OKLO", "AAPL"]
    assert today[0]["session"] == "BMO" and today[0]["watchlist"] is True
    assert today[1]["session"] == "AMC" and today[1]["watchlist"] is False
    assert [e["ticker"] for e in da["earnings_tomorrow"]] == ["SMR"]
    assert da["earnings_tomorrow"][0]["session"] == "—"


def test_day_ahead_synthesis_line():
    r = build_report(_now(), GAUGES, DAY_AHEAD_EVENTS, HEADLINES, DAY_AHEAD_FUTURES,
                     watchlist={"OKLO"})
    s = r["day_ahead"]["synthesis"]
    assert "ES +0.3%" in s
    assert "RTY lagging" in s
    assert "FOMC rate decision 14:00 ET" in s
    assert "2 earnings today (1 watchlist)" in s


def test_day_ahead_empty_inputs():
    r = build_report(_now(), [], [], [], [])
    assert r["day_ahead"]["synthesis"] == "Quiet slate."
    assert r["day_ahead"]["earnings_today"] == []


def test_render_markdown_includes_day_ahead():
    md = render_markdown(build_report(_now(), GAUGES, DAY_AHEAD_EVENTS, HEADLINES,
                                      DAY_AHEAD_FUTURES, watchlist={"OKLO"}))
    assert "**Day ahead:**" in md
    assert "OKLO BMO" in md


def test_gex_line_sticky_and_squeezy():
    from argus.report.morning import gex_line
    # spot above zero-gamma, positive GEX -> sticky
    s = gex_line(spot=750.0, zero_gamma=748.9, total_gex=1.5e9)
    assert "supportive" in s and "dips likely bought" in s
    # spot below zero-gamma -> moves extend
    s2 = gex_line(spot=740.0, zero_gamma=748.9, total_gex=-2e8)
    assert "below zero-gamma" in s2 and "moves extend" in s2
    assert gex_line(spot=None, zero_gamma=748.9, total_gex=1e9) is None
    assert gex_line(spot=750.0, zero_gamma=None, total_gex=1e9) is None


def test_day_ahead_includes_gex_and_watchlist_news():
    r = build_report(_now(), GAUGES, DAY_AHEAD_EVENTS, HEADLINES, DAY_AHEAD_FUTURES,
                     watchlist={"NVDA", "OKLO"},
                     gex={"spot": 750.0, "zero_gamma": 748.9, "total_gex": 1.5e9})
    da = r["day_ahead"]
    assert "supportive" in da["gex_line"]
    # NVDA headline is in HEADLINES and in the watchlist -> surfaced
    assert da["watchlist_news"] == [{"ticker": "NVDA", "headline": "Chips rally on AI demand"}]


def test_day_ahead_gex_absent_is_none():
    r = build_report(_now(), GAUGES, DAY_AHEAD_EVENTS, HEADLINES, DAY_AHEAD_FUTURES)
    assert r["day_ahead"]["gex_line"] is None
    assert r["day_ahead"]["watchlist_news"] == []
