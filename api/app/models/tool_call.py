"""ToolCall — one tool invocation by an agent.

Recorded separately from messages so we can:
  - Surface "what did this agent actually *do*?" in the UI
  - Track tool latency and failure rates
  - Replay a run by re-executing tools in order (future)
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.agent import Agent
    from app.models.run import Run


class ToolCall(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "tool_calls"

    run_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    agent_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    tool_name: Mapped[str] = mapped_column(String(80), nullable=False, index=True)

    # Whatever the agent passed in. Bounded by the tool's signature.
    arguments: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    # Whatever the tool returned. Null until completion.
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Set on failure; null on success.
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Wall-clock duration. Useful for spotting slow tools in the UI.
    duration_ms: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Relationships
    run: Mapped["Run"] = relationship(back_populates="tool_calls")
    agent: Mapped["Agent"] = relationship(back_populates="tool_calls")
