"""US session state (mirror of dashboard/lib/market-clock.ts; no holidays)."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo


def us_market_open(now: datetime | None = None) -> bool:
    et = (now or datetime.now(timezone.utc)).astimezone(ZoneInfo("America/New_York"))
    if et.weekday() >= 5:
        return False
    mins = et.hour * 60 + et.minute
    return 9 * 60 + 30 <= mins < 16 * 60
