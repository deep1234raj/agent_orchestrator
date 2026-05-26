"""Tool listing schema for the UI's agent-config dropdown."""
from __future__ import annotations

from typing import Any

from app.schemas._common import ApiModel


class ToolRead(ApiModel):
    name: str
    description: str
    input_schema: dict[str, Any]
