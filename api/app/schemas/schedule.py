"""Schedule response schema."""

from __future__ import annotations

import uuid
from datetime import datetime

from app.models.enums import ScheduleStatus
from app.schemas._common import ApiModel


class ScheduleRead(ApiModel):
    id: uuid.UUID
    workflow_id: uuid.UUID
    name: str
    cron: str
    timezone: str
    status: ScheduleStatus
    next_fire_at: datetime | None
    last_fired_at: datetime | None
    created_at: datetime
    updated_at: datetime
