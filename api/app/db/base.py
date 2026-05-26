"""SQLAlchemy declarative base and shared column types.

All models inherit from `Base`. Timestamp and UUID-v7 primary key behavior
are provided by mixins so individual model files stay focused on their
own concerns.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.db.uuid7 import uuid7


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


class UUIDPKMixin:
    """UUID v7 primary key. Time-ordered for index-friendliness."""

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid7,
    )


class TimestampMixin:
    """`created_at` and `updated_at`, both timezone-aware UTC."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )
