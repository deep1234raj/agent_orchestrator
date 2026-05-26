"""Message — the inter-agent communication bus.

Every utterance during a run lands here: user input, agent outputs,
agent-to-agent messages, system events, tool results. The UI's live
view is just a tail of this table filtered by run_id.

Async communication is achieved by treating this table as the source
of truth: agents read from it and write to it, never call each other
directly. The runtime broadcasts inserts via WebSocket so the UI sees
them as they happen.
"""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import JSON, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPKMixin
from app.models.enums import MessageRole

if TYPE_CHECKING:
    from app.models.agent import Agent
    from app.models.run import Run


class Message(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "messages"

    run_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Null when role is USER or SYSTEM. Set when an agent authored the message.
    agent_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    role: Mapped[MessageRole] = mapped_column(String(20), nullable=False, index=True)

    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Free-form structured payload: routing hints, citations, attachments, etc.
    # Kept open so tools and channels can pass through their native shapes
    # without schema changes.
    meta: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    # Relationships
    run: Mapped["Run"] = relationship(back_populates="messages")
    agent: Mapped["Agent | None"] = relationship(
        back_populates="messages",
        foreign_keys=[agent_id],
    )
