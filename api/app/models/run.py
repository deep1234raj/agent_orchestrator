"""Run — one execution of a workflow.

A run is created the moment something requests execution (UI click,
Telegram message, schedule fire). It's the parent record for every
message, tool call, and usage event that happens during that execution.

Runs are immutable history once finished. The only mutation during a
run is status transitions and the `finished_at` timestamp.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, DateTime, Enum as SAEnum, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPKMixin
from app.models.enums import RunStatus

if TYPE_CHECKING:
    from app.models.message import Message
    from app.models.tool_call import ToolCall
    from app.models.usage_event import UsageEvent
    from app.models.workflow import Workflow


class Run(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "runs"

    workflow_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("workflows.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    status: Mapped[RunStatus] = mapped_column(
        SAEnum(RunStatus, native_enum=False, length=20, values_callable=lambda e: [m.value for m in e]),
        nullable=False, default=RunStatus.PENDING, index=True,
    )

    # What kicked this off. Examples: "ui", "telegram", "schedule".
    trigger: Mapped[str] = mapped_column(String(40), nullable=False)

    # Initial state handed to the graph (e.g. {"input": "lithium batteries"}).
    input: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    # Final state when finished. Null until done.
    output: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Populated on failure.
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Lifecycle timestamps. `started_at` is set when the worker picks it up.
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Denormalized totals, updated as the run progresses. Saves the UI from
    # aggregating across the messages/usage tables on every poll.
    total_tokens: Mapped[int] = mapped_column(default=0, nullable=False)
    total_cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Relationships
    workflow: Mapped["Workflow"] = relationship(back_populates="runs")
    messages: Mapped[list["Message"]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )
    tool_calls: Mapped[list["ToolCall"]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="ToolCall.created_at",
    )
    usage_events: Mapped[list["UsageEvent"]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
    )
