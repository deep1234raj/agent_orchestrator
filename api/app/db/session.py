"""Async SQLAlchemy session factory.

Provides a single engine and a session factory used everywhere that needs
database access. Routes get sessions via FastAPI dependency injection;
the runtime opens them directly via `session_scope()`.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)


def _normalize_url(url: str) -> str:
    """Make sure the URL uses the async driver."""
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql+psycopg://"):
        return url.replace("postgresql+psycopg://", "postgresql+asyncpg://", 1)
    return url


DATABASE_URL = _normalize_url(
    os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres:postgres@localhost:5432/aaop",
    )
)

# Pool params apply to server-based databases (Postgres). SQLite (used
# in some unit tests) doesn't accept them.
_engine_kwargs: dict = {"echo": False, "pool_pre_ping": True}
if "sqlite" not in DATABASE_URL:
    _engine_kwargs.update({"pool_size": 10, "max_overflow": 20})

engine = create_async_engine(DATABASE_URL, **_engine_kwargs)

SessionFactory = async_sessionmaker(
    engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


@asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    """Context-managed session that commits on success and rolls back on error.

    Use from the runtime where FastAPI's dependency injection isn't available.
    """
    async with SessionFactory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency for request-scoped sessions."""
    async with SessionFactory() as session:
        try:
            yield session
        finally:
            await session.close()
