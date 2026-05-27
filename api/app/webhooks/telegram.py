"""Telegram webhook handler.

POST /webhooks/telegram/{agent_id} receives Update objects from Telegram. We:

  1. Look up the channel agent and verify its webhook secret.
  2. Parse the Update for a text message.
  3. Find ALL active workflows whose graph references this agent_id.
  4. Build a conversation preamble from recent runs on this chat.
  5. Create one PENDING run per matching workflow.
  6. Return 200 immediately.

Telegram retries on non-2xx, so we return 200 even for no-match cases.
Fan-out means one incoming message can trigger multiple independent workflows.
"""

from __future__ import annotations

import uuid
from typing import Any

import sqlalchemy as sa
import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.models.agent import Agent
from app.models.enums import RunStatus
from app.models.run import Run
from app.models.workflow import Workflow
from app.services.conversation import build_conversation_preamble

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/telegram/{agent_id}", status_code=status.HTTP_200_OK)
async def telegram_webhook_agent(
    agent_id: uuid.UUID,
    request: Request,
    s: AsyncSession = Depends(get_session),
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
) -> dict[str, Any]:
    """Receive a Telegram Update for a specific channel-agent.

    Fans out to ALL active workflows whose graph contains this agent.
    """
    agent = await s.get(Agent, agent_id)
    if agent is None or agent.channel_kind != "telegram":
        return {"status": "ignored"}

    # Verify the agent's own webhook secret (if configured).
    webhook_secret = (agent.channel_config or {}).get("webhook_secret")
    if webhook_secret:
        provided = x_telegram_bot_api_secret_token or ""
        if provided != webhook_secret:
            log.warning("telegram_webhook_verification_failed", agent_id=str(agent_id))
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="webhook verification failed",
            )

    update = await request.json()
    parsed = _extract_text_message(update)
    if parsed is None:
        return {"status": "ignored"}

    chat_id = str(parsed["chat_id"])
    text = parsed["text"]
    sender_name = parsed.get("sender_name")

    # Find all active workflows whose graph references this agent.
    wf_result = await s.execute(
        select(Workflow).where(Workflow.graph.cast(sa.Text).contains(str(agent_id)))
    )
    workflows = list(wf_result.scalars())
    if not workflows:
        log.info("telegram_agent_no_workflows", agent_id=str(agent_id))
        return {"status": "no_workflows"}

    # Fan-out: one Run per matching workflow.
    runs: list[Run] = []
    for wf in workflows:
        preamble = await build_conversation_preamble(
            session=s,
            workflow_id=wf.id,
            channel="telegram",
            chat_id=chat_id,
        )
        full_input = f"{preamble}\n\n---\n\nNew user message: {text}" if preamble else text

        run = Run(
            workflow_id=wf.id,
            status=RunStatus.PENDING,
            trigger="telegram",
            input={
                "input": full_input,
                "channel": "telegram",
                "chat_id": chat_id,
                "sender_name": sender_name,
                "raw_message": text,
                "triggering_agent_id": str(agent_id),
            },
        )
        s.add(run)
        runs.append(run)

    await s.commit()
    run_ids = [str(r.id) for r in runs]
    log.info(
        "telegram_agent_runs_enqueued",
        agent_id=str(agent_id),
        run_ids=run_ids,
    )
    return {"status": "queued", "run_ids": run_ids}


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
