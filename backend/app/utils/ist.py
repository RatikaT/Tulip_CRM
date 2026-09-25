"""
Single source of truth for IST (Asia/Kolkata, UTC+5:30) date handling.

MongoDB stores naive UTC datetimes and the server (Render) runs in UTC, so
date.today() / datetime.now() / dt.date() all give the *UTC* calendar day.
Anything the business calls "today", "due today", "overdue" or "on 25 Sep"
means the IST calendar day - always go through these helpers.
"""
from datetime import date, datetime, timedelta, timezone
from typing import Optional, Tuple

IST_OFFSET = timedelta(hours=5, minutes=30)


def now_ist() -> datetime:
    """Current wall-clock time in IST (naive)."""
    return datetime.utcnow() + IST_OFFSET


def today_ist() -> date:
    """Current IST calendar date."""
    return now_ist().date()


def to_ist(dt: Optional[datetime]) -> Optional[datetime]:
    """Stored UTC datetime -> naive IST datetime. Aware datetimes are converted
    properly; naive ones are assumed UTC (Mongo's convention)."""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt + IST_OFFSET


def ist_date(dt) -> Optional[date]:
    """IST calendar date of a stored datetime. Plain dates pass through."""
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return to_ist(dt).date()
    if isinstance(dt, date):
        return dt
    return None


def ist_day_start_utc(d: date) -> datetime:
    """UTC instant of IST midnight at the start of day d."""
    return datetime(d.year, d.month, d.day) - IST_OFFSET


def ist_range_utc(start: date, end: Optional[date] = None) -> Tuple[datetime, datetime]:
    """Half-open UTC bounds [from, to) covering IST days start..end inclusive.
    Query with {"$gte": from, "$lt": to}."""
    end = end or start
    return ist_day_start_utc(start), ist_day_start_utc(end) + timedelta(days=1)


def ist_today_range_utc() -> Tuple[datetime, datetime]:
    """UTC bounds of the current IST day."""
    return ist_range_utc(today_ist())


def parse_ymd(s: Optional[str]) -> Optional[date]:
    """'YYYY-MM-DD' -> date, or None if empty/invalid."""
    if not s:
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        return None
