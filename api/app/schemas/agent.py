"""Agent request/response schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import Field

from app.models.enums import MemoryMode
from app.schemas._common import ApiModel


class GuardrailsIn(ApiModel):
    """Per-agent guardrails. All optional with sane defaults applied at runtime."""

    max_iterations: int | None = Field(default=None, ge=1, le=100)
    max_cost_usd: float | None = Field(default=None, ge=0)
    content_filter: bool | None = None


class AgentBase(ApiModel):
    name: str = Field(min_length=1, max_length=120)
    role: str = Field(min_length=1, max_length=120)
    system_prompt: str = Field(min_length=1)
    provider: str = Field(default="anthropic", max_length=40)
    model: str = Field(default="claude-sonnet-4-5", max_length=80)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=2048, ge=1, le=200000)
    tools: list[str] = Field(default_factory=list)
    memory_mode: MemoryMode = MemoryMode.SUMMARY
    memory_window: int = Field(default=10, ge=0, le=200)
    guardrails: dict[str, Any] = Field(default_factory=dict)


class AgentCreate(AgentBase):
    pass


class AgentUpdate(ApiModel):
    """All fields optional — only what's present is updated."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    role: str | None = Field(default=None, min_length=1, max_length=120)
    system_prompt: str | None = Field(default=None, min_length=1)
    provider: str | None = Field(default=None, max_length=40)
    model: str | None = Field(default=None, max_length=80)
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    max_tokens: int | None = Field(default=None, ge=1, le=200000)
    tools: list[str] | None = None
    memory_mode: MemoryMode | None = None
    memory_window: int | None = Field(default=None, ge=0, le=200)
    guardrails: dict[str, Any] | None = None


class AgentRead(AgentBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
