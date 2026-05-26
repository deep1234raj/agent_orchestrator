"""Run response schemas.

Runs are read-only from the API's perspective — they're created by
workflow triggers (POST /workflows/{id}/run, the Telegram webhook, the
scheduler) and mutated only by the runtime. So we expose Read and a
List, and a Cancel action.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from app.models.enums import RunStatus
from app.schemas._common import ApiModel


class MessageRead(ApiModel):
    id: uuid.UUID
    role: str
    content: str
    agent_id: uuid.UUID | None
    meta: dict[str, Any]
    created_at: datetime


class ToolCallRead(ApiModel):
    id: uuid.UUID
    tool_name: str
    agent_id: uuid.UUID
    arguments: dict[str, Any]
    result: dict[str, Any] | None
    error: str | None
    duration_ms: float | None
    created_at: datetime


class UsageEventRead(ApiModel):
    id: uuid.UUID
    agent_id: uuid.UUID
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    created_at: datetime


class RunRead(ApiModel):
    id: uuid.UUID
    workflow_id: uuid.UUID
    status: RunStatus
    trigger: str
    input: dict[str, Any]
    output: dict[str, Any] | None
    error: str | None
    started_at: datetime | None
    finished_at: datetime | None
    total_tokens: int
    total_cost_usd: float
    created_at: datetime
    updated_at: datetime


class RunDetail(RunRead):
    """Run plus its full message log and tool calls."""

    messages: list[MessageRead] = []
    tool_calls: list[ToolCallRead] = []
    usage_events: list[UsageEventRead] = []
