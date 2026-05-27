"""Tools route — list every registered tool (drives the UI dropdown)."""

from __future__ import annotations

from fastapi import APIRouter

from app.schemas.tool import ToolRead
from app.tools.registry import list_tools

router = APIRouter(prefix="/tools", tags=["tools"])


@router.get("", response_model=list[ToolRead])
async def list_registered_tools() -> list[ToolRead]:
    return [
        ToolRead(
            name=spec.name,
            description=spec.description,
            input_schema=spec.schema_model.model_json_schema(),
        )
        for spec in list_tools()
    ]
