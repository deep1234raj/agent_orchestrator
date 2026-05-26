"""Agent — a configured AI persona.

The agent row is the single source of truth for an agent's behavior.
At workflow execution time, the runtime materializes a LangGraph node
from this configuration. Nothing about the agent lives in code.
"""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPKMixin
from app.models.enums import MemoryMode

if TYPE_CHECKING:
    from app.models.message import Message
    from app.models.tool_call import ToolCall
    from app.models.usage_event import UsageEvent


class Agent(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "agents"

    # Identity
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    role: Mapped[str] = mapped_column(String(120), nullable=False)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)

    # Model config
    provider: Mapped[str] = mapped_column(String(40), nullable=False, default="anthropic")
    model: Mapped[str] = mapped_column(String(80), nullable=False, default="claude-sonnet-4-5")
    temperature: Mapped[float] = mapped_column(Float, nullable=False, default=0.7)
    max_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=2048)

    # Tools — list of tool names registered in app.tools registry
    tools: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)

    # Memory
    memory_mode: Mapped[MemoryMode] = mapped_column(
        String(20), nullable=False, default=MemoryMode.SUMMARY
    )
    memory_window: Mapped[int] = mapped_column(Integer, nullable=False, default=10)

    # Guardrails — embedded as JSON to keep the schema thin; validated by Pydantic.
    # Expected shape: {"max_iterations": int, "max_cost_usd": float,
    #                  "content_filter": bool}
    guardrails: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    # Relationships
    messages: Mapped[list["Message"]] = relationship(
        back_populates="agent",
        cascade="all, delete-orphan",
        foreign_keys="Message.agent_id",
    )
    tool_calls: Mapped[list["ToolCall"]] = relationship(
        back_populates="agent",
        cascade="all, delete-orphan",
    )
    usage_events: Mapped[list["UsageEvent"]] = relationship(
        back_populates="agent",
        cascade="all, delete-orphan",
    )
