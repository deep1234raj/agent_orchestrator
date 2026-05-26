"""get_time — current time in a given timezone.

Trivial but genuinely useful: it lets an agent answer "what day is it"
without making up an answer, which matters for scheduling and freshness
reasoning.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.tools.registry import tool


@tool(description="Return the current date and time in an IANA timezone (e.g. 'UTC', 'Asia/Singapore').")
async def get_time(timezone: str = "UTC") -> dict[str, Any]:
    """Returns {iso: str, timezone: str, error: str|None}."""
    try:
        tz = ZoneInfo(timezone)
    except ZoneInfoNotFoundError:
        return {"iso": "", "timezone": timezone, "error": f"unknown timezone: {timezone}"}

    now = datetime.now(tz)
    return {"iso": now.isoformat(), "timezone": timezone, "error": None}
