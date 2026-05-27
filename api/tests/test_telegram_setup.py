"""Tests for POST /webhooks/telegram/setup."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.webhooks.telegram import router

# Minimal app — no DB lifespan needed; the setup endpoint has no DB dependency.
_app = FastAPI()
_app.include_router(router)


@pytest.fixture
async def client() -> AsyncClient:  # type: ignore[override]
    async with AsyncClient(transport=ASGITransport(app=_app), base_url="http://test") as ac:
        yield ac


async def test_setup_webhook_no_token(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.config.settings.telegram_bot_token", None)
    resp = await client.post(
        "/webhooks/telegram/setup",
        json={"base_url": "https://abc.ngrok-free.app"},
    )
    assert resp.status_code == 400
    assert "TELEGRAM_BOT_TOKEN" in resp.json()["detail"]


async def test_setup_webhook_rejects_http_url(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.config.settings.telegram_bot_token", "test-token")
    resp = await client.post(
        "/webhooks/telegram/setup",
        json={"base_url": "http://not-secure.example.com"},
    )
    assert resp.status_code == 422  # Pydantic validation error


async def test_setup_webhook_success(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.config.settings.telegram_bot_token", "test-token")
    monkeypatch.setattr("app.config.settings.telegram_webhook_secret", "test-secret")

    mock_resp = MagicMock()
    mock_resp.json.return_value = {"ok": True, "description": "Webhook was set"}

    with patch("app.webhooks.telegram.httpx.AsyncClient") as mock_client_cls:
        mock_client_instance = AsyncMock()
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=False)
        mock_client_instance.post = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value = mock_client_instance

        resp = await client.post(
            "/webhooks/telegram/setup",
            json={"base_url": "https://abc.ngrok-free.app"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["description"] == "Webhook was set"

    call_kwargs = mock_client_instance.post.call_args
    posted_json = call_kwargs.kwargs["json"]
    assert posted_json["url"] == "https://abc.ngrok-free.app/webhooks/telegram"
    assert posted_json["secret_token"] == "test-secret"
