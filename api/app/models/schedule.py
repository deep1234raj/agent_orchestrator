"""Schedule — cron-style trigger for a workflow.

A lightweight scheduler tick runs in-process every 60s, queries this
table for ACTIVE schedules whose `next_fire_at` has passed, and creates
a Run for each. The next fire time is recomputed from the cron expression.

`croniter` is the parser; we don't ship a full job scheduler — too heavy
for v1 scope.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPKMixin
from app.models.enums import ScheduleStatus

if TYPE_CHECKING:
    from app.models.workflow import Workflow


class Schedule(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "schedules"

    workflow_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("workflows.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)

    # Standard 5-field cron expression: "*/15 * * * *"
    cron: Mapped[str] = mapped_column(String(80), nullable=False)

    # IANA tz name, e.g. "Asia/Singapore". Used by croniter.
    timezone: Mapped[str] = mapped_column(String(60), nullable=False, default="UTC")

    # The input passed into each scheduled run.
    input: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    status: Mapped[ScheduleStatus] = mapped_column(
        String(20), nullable=False, default=ScheduleStatus.ACTIVE, index=True
    )

    # Computed at creation and after every fire. The scheduler tick polls on this.
    next_fire_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    last_fired_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    workflow: Mapped["Workflow"] = relationship(back_populates="schedules")
