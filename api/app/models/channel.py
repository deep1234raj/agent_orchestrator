"""Channel — routing rule from an external messaging channel to a channel agent.

Every channel row binds a (kind, external_id) tuple to an Agent that owns the
bot credentials. Incoming messages route to ALL workflows containing that agent.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPKMixin
from app.models.enums import ChannelKind

if TYPE_CHECKING:
    from app.models.agent import Agent


class Channel(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "channels"
    __table_args__ = (UniqueConstraint("kind", "external_id", name="uq_channel_kind_external_id"),)

    agent_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind: Mapped[ChannelKind] = mapped_column(
        SAEnum(
            ChannelKind,
            native_enum=False,
            length=20,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    external_id: Mapped[str] = mapped_column(String(120), nullable=False)
    config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    agent: Mapped[Agent] = relationship(back_populates="channels")
