"""Channel binding request/response schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import Field

from app.models.enums import ChannelKind
from app.schemas._common import ApiModel


class ChannelBase(ApiModel):
    workflow_id: uuid.UUID
    kind: ChannelKind
    external_id: str = Field(min_length=1, max_length=120)
    config: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class ChannelCreate(ChannelBase):
    pass


class ChannelUpdate(ApiModel):
    workflow_id: uuid.UUID | None = None
    config: dict[str, Any] | None = None
    enabled: bool | None = None


class ChannelRead(ChannelBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
