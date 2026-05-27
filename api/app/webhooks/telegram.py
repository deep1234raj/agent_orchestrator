"""Telegram webhook handler.

POST /webhooks/telegram receives Update objects from Telegram. We:

  1. Verify the secret header (when configured).
  2. Parse the Update for a text message.
  3. Find the Channel row matching this kind/external_id (or the wildcard "*").
  4. Build a conversation preamble from recent runs on this chat.
  5. Create a PENDING run; the worker picks it up.
  6. Return 200 to Telegram immediately. The agent will reply via
     send_message asynchronously.

Telegram retries on non-2xx responses, so this handler must complete
quickly and only return errors when something is genuinely broken
(verification failure, bad payload). When a chat has no bound workflow,
we 200-and-ignore — silence is the right behavior for unintended bots.
"""
from __future__ import annotations

from typing import Any

import httpx
import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.channels.base import get_channel_or_none
from app.config import settings
from app.db.session import get_session
from app.models.channel import Channel
from app.models.enums import ChannelKind, RunStatus
from app.models.run import Run
from app.services.conversation import build_conversation_preamble

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/telegram", status_code=status.HTTP_200_OK)
async def telegram_webhook(
    request: Request,
    s: AsyncSession = Depends(get_session),
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
) -> dict[str, str]:
    """Receive a Telegram Update and enqueue a run."""
    # 1. Verify origin.
    channel = get_channel_or_none(ChannelKind.TELEGRAM)
    if channel is None:
        # Bot token wasn't configured — return 200 so Telegram doesn't retry
        # forever, but log so the operator notices.
        log.warning("telegram_webhook_unconfigured")
        return {"status": "ignored"}

    headers = {
        "x-telegram-bot-api-secret-token": x_telegram_bot_api_secret_token or "",
    }
    if not channel.verify_webhook(headers):
        log.warning("telegram_webhook_verification_failed")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="webhook verification failed")

    # 2. Parse the payload.
    update = await request.json()
    parsed = _extract_text_message(update)
    if parsed is None:
        # Not a text message we care about (sticker, edit, etc.). 200-ack.
        return {"status": "ignored"}

    chat_id = str(parsed["chat_id"])
    text = parsed["text"]
    sender_name = parsed.get("sender_name")

    # 3. Find a Channel binding. Try chat-specific first, then wildcard.
    binding = await _find_binding(s, chat_id)
    if binding is None:
        log.info("telegram_webhook_no_binding", chat_id=chat_id)
        return {"status": "no_binding"}

    # 4. Build conversation preamble for cross-run memory.
    preamble = await build_conversation_preamble(
        session=s,
        workflow_id=binding.workflow_id,
        channel="telegram",
        chat_id=chat_id,
    )

    # The runtime gives `input` to the first agent. We combine the
    # preamble (if any) with the current message into one structured
    # input the agent can reason over.
    if preamble:
        full_input = f"{preamble}\n\n---\n\nNew user message: {text}"
    else:
        full_input = text

    # 5. Create the run. The worker dispatches asynchronously.
    run = Run(
        workflow_id=binding.workflow_id,
        status=RunStatus.PENDING,
        trigger="telegram",
        input={
            "input": full_input,
            "channel": "telegram",
            "chat_id": chat_id,
            "sender_name": sender_name,
            "raw_message": text,  # kept separately for debugging / audit
        },
    )
    s.add(run)
    await s.commit()

    log.info("telegram_run_enqueued", chat_id=chat_id,
             workflow_id=str(binding.workflow_id), run_id=str(run.id))
    return {"status": "queued", "run_id": str(run.id)}


class SetupWebhookRequest(BaseModel):
    base_url: str

    @field_validator("base_url")
    @classmethod
    def must_be_https(cls, v: str) -> str:
        if not v.startswith("https://"):
            raise ValueError("base_url must start with https://")
        return v.rstrip("/")


class SetupWebhookResponse(BaseModel):
    ok: bool
    description: str | None = None


@router.post("/telegram/setup", response_model=SetupWebhookResponse)
async def setup_telegram_webhook(body: SetupWebhookRequest) -> SetupWebhookResponse:
    """Call Telegram setWebhook on behalf of the configured bot."""
    if not settings.telegram_bot_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="TELEGRAM_BOT_TOKEN is not configured",
        )

    webhook_url = f"{body.base_url}/webhooks/telegram"
    payload: dict[str, str] = {"url": webhook_url}
    if settings.telegram_webhook_secret:
        payload["secret_token"] = settings.telegram_webhook_secret

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{settings.telegram_bot_token}/setWebhook",
                json=payload,
                timeout=10.0,
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Telegram API unreachable: {exc}",
        ) from exc

    if not data.get("ok", False):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=data.get("description", "Telegram rejected the webhook registration"),
        )

    return SetupWebhookResponse(
        ok=data.get("ok", False),
        description=data.get("description"),
    )


# ─── helpers ─────────────────────────────────────────────────────────────────


def _extract_text_message(update: dict[str, Any]) -> dict[str, Any] | None:
    """Pull the bits we care about out of a Telegram Update.

    Returns None for any Update type other than an incoming text message
    (callbacks, edits, channel posts, etc. are out of scope for v1).
    """
    msg = update.get("message")
    if not msg or "text" not in msg:
        return None
    chat = msg.get("chat", {})
    sender = msg.get("from", {})
    return {
        "chat_id": chat.get("id"),
        "text": msg["text"],
        "sender_name": sender.get("first_name") or sender.get("username"),
    }


async def _find_binding(s: AsyncSession, chat_id: str) -> Channel | None:
    """Return the Channel binding for this chat.

    Lookup order:
      1. Exact chat_id match.
      2. Wildcard "*" — a bot bound to *any* chat.

    Either way the binding must be enabled.
    """
    for external_id in (chat_id, "*"):
        result = await s.execute(
            select(Channel).where(
                Channel.kind == ChannelKind.TELEGRAM,
                Channel.external_id == external_id,
                Channel.enabled.is_(True),
            )
        )
        ch = result.scalar_one_or_none()
        if ch is not None:
            return ch
    return None
