"""Schedule request/response schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import Field, field_validator

from app.models.enums import ScheduleStatus
from app.schemas._common import ApiModel


class ScheduleCreate(ApiModel):
    workflow_id: uuid.UUID
    name: str = Field(min_length=1, max_length=120)
    cron: str = Field(min_length=1, max_length=80)
    timezone: str = Field(default="UTC", max_length=60)
    input: dict[str, Any] = Field(default_factory=dict)

    @field_validator("cron")
    @classmethod
    def validate_cron(cls, v: str) -> str:
        from croniter import croniter

        if not croniter.is_valid(v):
            raise ValueError(f"Invalid cron expression: {v!r}")
        return v


class ScheduleUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    cron: str | None = Field(default=None, min_length=1, max_length=80)
    timezone: str | None = Field(default=None, max_length=60)
    input: dict[str, Any] | None = None
    status: ScheduleStatus | None = None

    @field_validator("cron")
    @classmethod
    def validate_cron(cls, v: str | None) -> str | None:
        if v is None:
            return v
        from croniter import croniter

        if not croniter.is_valid(v):
            raise ValueError(f"Invalid cron expression: {v!r}")
        return v


class ScheduleRead(ApiModel):
    id: uuid.UUID
    workflow_id: uuid.UUID
    name: str
    cron: str
    timezone: str
    input: dict[str, Any]
    status: ScheduleStatus
    next_fire_at: datetime | None
    last_fired_at: datetime | None
    created_at: datetime
    updated_at: datetime
