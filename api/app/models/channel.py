"""Channel — binding between an external messaging channel and a workflow.

When a Telegram message arrives, the webhook handler looks up the Channel
row by `external_id` (the bot's chat or bot identifier), finds the bound
workflow, and creates a run with the message as input.

One Channel row per (kind, external_id). A workflow can have many channels
(e.g. Telegram + Slack), but the v1 implementation only fulfills Telegram.
"""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, Enum as SAEnum, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPKMixin
from app.models.enums import ChannelKind

if TYPE_CHECKING:
    from app.models.workflow import Workflow


class Channel(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "channels"
    __table_args__ = (
        UniqueConstraint("kind", "external_id", name="uq_channel_kind_external_id"),
    )

    workflow_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("workflows.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    kind: Mapped[ChannelKind] = mapped_column(
        SAEnum(ChannelKind, native_enum=False, length=20, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )

    # The channel-side identifier we route on.
    # Telegram: chat_id (or "*" to bind a bot to all chats).
    external_id: Mapped[str] = mapped_column(String(120), nullable=False)

    # Channel-specific config: bot tokens are in env, but per-channel knobs
    # (e.g. allowed user list, default language) live here.
    config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Relationships
    workflow: Mapped["Workflow"] = relationship(back_populates="channels")
