"""Shared test fixtures."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.tools.registry import import_all_tools


@pytest.fixture(scope="session", autouse=True)
def _register_tools() -> None:
    """Ensure all tools are registered before any test runs."""
    import_all_tools()


@pytest.fixture(scope="session")
async def client() -> AsyncClient:  # type: ignore[override]
    """Session-scoped async client against the real app.

    Session-scoped so the lifespan (and background tasks) start once and
    stop once — per-test client teardown triggers event-loop cleanup races
    with asyncpg connection pools.
    """
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
