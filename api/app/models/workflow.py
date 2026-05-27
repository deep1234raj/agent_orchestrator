"""Workflow — a graph of agents wired together with conditions and loops.

The `graph` JSON column holds the serialized React Flow document
(nodes + edges + viewport). The runtime compiler reads this and emits a
LangGraph at execution time. We store the raw editor format so the UI
can round-trip without lossy transforms.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.run import Run
    from app.models.schedule import Schedule


class Workflow(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "workflows"

    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # React Flow document. Expected shape:
    #   {"nodes": [...], "edges": [...], "viewport": {...}}
    # Validated by WorkflowGraph Pydantic schema before persistence.
    graph: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    # Whether this workflow appears in the templates picker / can be cloned.
    is_template: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Relationships
    runs: Mapped[list["Run"]] = relationship(
        back_populates="workflow",
        cascade="all, delete-orphan",
    )
    schedules: Mapped[list["Schedule"]] = relationship(
        back_populates="workflow",
        cascade="all, delete-orphan",
    )
