"""GET /models — returns the list of supported LLM models.

The frontend uses this to populate the model dropdown when creating or
editing an agent. Deriving the list from PRICES guarantees that the
frontend and cost-accounting always agree on which models exist.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.runtime.pricing import SUPPORTED_MODELS

router = APIRouter(prefix="/models", tags=["models"])


class ModelInfo(BaseModel):
    provider: str
    model: str
    label: str


@router.get("", response_model=list[ModelInfo])
async def list_models() -> list[dict[str, str]]:
    """Return all supported models in display order."""
    return SUPPORTED_MODELS
