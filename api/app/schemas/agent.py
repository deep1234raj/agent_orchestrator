"""Agent request/response schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from app.models.enums import MemoryMode
from app.schemas._common import ApiModel


class GuardrailsIn(ApiModel):
    """Per-agent guardrails. All optional with sane defaults applied at runtime."""

    max_iterations: int | None = Field(default=None, ge=1, le=100)
    max_cost_usd: float | None = Field(default=None, ge=0)
    content_filter: bool | None = None


class InteractionRulesIn(ApiModel):
    """Structured interaction rules stored in agents.interaction_rules JSON.

    Three categories:
      1. Operational Constraints — enforced in AgentNode before the LLM call.
      2. Interaction & Communication Protocols — injected as system-prompt instructions.
      3. Logic & Domain Rules (SOPs) — injected as system-prompt bullet points.
    """

    # --- 1. Operational Constraints ---
    allowed_tools: list[str] = Field(
        default_factory=list,
        description="Whitelist of tool names. Empty = no restriction.",
    )
    denied_tools: list[str] = Field(
        default_factory=list,
        description="Blacklist of tool names this agent must never use.",
    )
    no_pii: bool = Field(default=False, description="Never transmit/store PII.")

    # --- 2. Interaction & Communication Protocols ---
    require_human_approval: bool = Field(
        default=False,
        description="Agent must flag irreversible actions for human approval.",
    )
    human_approval_actions: list[str] = Field(
        default_factory=list,
        description="Tool names that count as irreversible.",
    )
    authorized_delegators: list[str] = Field(
        default_factory=list,
        description="Agent names whose instructions this agent is authorised to act on.",
    )
    proactive_disclosure: bool = Field(
        default=True,
        description="Explain why a request can't be fulfilled instead of failing silently.",
    )

    # --- 3. Logic & Domain Rules ---
    output_format: Literal["markdown", "plain", "json", "bullet_points"] | None = None
    tone: Literal["formal", "casual", "technical", "friendly"] | None = None
    response_language: str | None = Field(default=None, max_length=10)
    forbidden_topics: list[str] = Field(default_factory=list)
    domain_rules: list[str] = Field(
        default_factory=list,
        description="Free-text SOPs injected as system-prompt bullets.",
    )


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
    channel_kind: str | None = Field(default=None, max_length=20)
    channel_config: dict[str, Any] = Field(default_factory=dict)
    skills: list[str] = Field(default_factory=list)
    interaction_rules: dict[str, Any] = Field(default_factory=dict)


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
    channel_kind: str | None = Field(default=None, max_length=20)
    channel_config: dict[str, Any] | None = None
    skills: list[str] | None = None
    interaction_rules: dict[str, Any] | None = None


class AgentRead(AgentBase):
    id: uuid.UUID
    default_workflow_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
