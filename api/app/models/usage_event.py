"""UsageEvent — one LLM call's worth of token and cost accounting.

Granular enough to attribute cost per agent per run, which the dashboard
rolls up. Costs are computed at insert time from a static price table
(see app.runtime.pricing) — cheap, deterministic, no surprise dependency
on provider billing APIs.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.agent import Agent
    from app.models.run import Run


class UsageEvent(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "usage_events"

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

    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    model: Mapped[str] = mapped_column(String(80), nullable=False)

    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Computed from provider+model+tokens via the pricing table.
    cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Relationships
    run: Mapped[Run] = relationship(back_populates="usage_events")
    agent: Mapped[Agent] = relationship(back_populates="usage_events")
