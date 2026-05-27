"""Workflow request/response schemas.

The `graph` field is intentionally typed as `dict` rather than a strict
React Flow schema — the editor format evolves and we don't want every
upstream tweak forcing a schema change here. The compiler validates the
parts it cares about at run time.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import Field

from app.schemas._common import ApiModel


class WorkflowBase(ApiModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    graph: dict[str, Any] = Field(default_factory=dict)
    is_template: bool = False


class WorkflowCreate(WorkflowBase):
    pass


class WorkflowUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    graph: dict[str, Any] | None = None
    is_template: bool | None = None


class WorkflowRead(WorkflowBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class WorkflowRunRequest(ApiModel):
    """Body of POST /workflows/{id}/run."""

    input: dict[str, Any] = Field(default_factory=dict)
