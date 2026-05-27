"""Shared Pydantic helpers.

`ApiModel` is the base for everything we serialize: it enables ORM
attribute reading so we can return SQLAlchemy rows directly, and
emits clean camelCase-free dicts (we use snake_case on the wire to
match Python — the TS client honors that).
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ApiModel(BaseModel):
    """Base for every request/response schema."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
