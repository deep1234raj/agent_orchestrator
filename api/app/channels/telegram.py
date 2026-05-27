"""Telegram channel adapter.

Sends messages via the Bot API. Verifies inbound webhooks via the
optional secret header.

Bot API reference: https://core.telegram.org/bots/api
"""

from __future__ import annotations

import httpx
import structlog

from app.channels.base import ChannelMessage
from app.models.enums import ChannelKind

log = structlog.get_logger(__name__)


TELEGRAM_API = "https://api.telegram.org"


class TelegramChannel:
    """Concrete Telegram implementation of the Channel protocol."""

    kind = ChannelKind.TELEGRAM

    def __init__(self, *, bot_token: str, webhook_secret: str | None = None) -> None:
        if not bot_token:
            raise ValueError("TelegramChannel requires a bot_token.")
        self._bot_token = bot_token
        self._webhook_secret = webhook_secret

    @property
    def _send_url(self) -> str:
        return f"{TELEGRAM_API}/bot{self._bot_token}/sendMessage"

    async def send(self, message: ChannelMessage) -> None:
        """Post a message to a Telegram chat.

        Truncates at 4096 chars (Telegram's limit) to avoid the API
        rejecting the whole message — better to deliver a clipped reply
        than nothing.
        """
        text = message.text
        if len(text) > 4096:
            text = text[:4093] + "…"

        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                resp = await client.post(
                    self._send_url,
                    json={
                        "chat_id": message.chat_id,
                        "text": text,
                        # Plain text mode. Avoids parser errors from markdown
                        # characters the agent might emit (asterisks, etc.).
                    },
                )
                resp.raise_for_status()
            except httpx.HTTPError as e:
                # Failure to deliver is logged but not raised — the run
                # itself has already produced its output; we don't want
                # to fail a run because the outbound message dropped.
                log.error("telegram_send_failed", chat_id=message.chat_id, error=str(e))

    def verify_webhook(self, headers: dict[str, str]) -> bool:
        """Verify the X-Telegram-Bot-Api-Secret-Token header.

        If no secret is configured on our side, we accept unconditionally —
        this is the local-dev mode. In production set TELEGRAM_WEBHOOK_SECRET
        and use the same value when calling /setWebhook.
        """
        if not self._webhook_secret:
            return True
        # Headers come in lowercase from Starlette.
        provided = headers.get("x-telegram-bot-api-secret-token", "")
        return provided == self._webhook_secret

    async def register_webhook(self, webhook_url: str) -> dict:
        """Call Telegram setWebhook for this bot.

        Returns the raw Telegram API response dict.
        Raises httpx.HTTPError on network failure.
        """
        payload: dict[str, str] = {"url": webhook_url}
        if self._webhook_secret:
            payload["secret_token"] = self._webhook_secret

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{TELEGRAM_API}/bot{self._bot_token}/setWebhook",
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()
