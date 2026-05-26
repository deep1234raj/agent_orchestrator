"""Enumerations shared across models.

Kept in one place so the same string values are used by the DB, the
Pydantic schemas, and the API contracts.
"""
from __future__ import annotations

import enum


class RunStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class MessageRole(str, enum.Enum):
    """Author of a message on the bus."""

    USER = "user"           # external human (e.g. via Telegram)
    AGENT = "agent"         # an agent in the workflow
    SYSTEM = "system"       # runtime-emitted status/control message
    TOOL = "tool"           # tool result


class ChannelKind(str, enum.Enum):
    TELEGRAM = "telegram"
    SLACK = "slack"         # stubbed; not implemented in v1
    WHATSAPP = "whatsapp"   # stubbed; not implemented in v1


class MemoryMode(str, enum.Enum):
    NONE = "none"
    WINDOWED = "windowed"   # last N turns
    SUMMARY = "summary"     # rolling summary


class ScheduleStatus(str, enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"
