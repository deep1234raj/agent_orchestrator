"""Conversation history across runs.

Each Telegram message becomes its own run. To make conversations feel
continuous, we fetch the last N user messages and final agent replies
from the same chat_id and prepend them as a "Recent conversation"
preamble in the new run's input.

This is cheap, deterministic, and requires no schema changes — we use
the existing `runs.input` (carrying `chat_id`) and `messages` tables.

If the run's first agent has memory_mode != NONE, it will further see
this preamble carried through into its own memory selection. The two
mechanisms compose without coordination.
"""
from __future__ import annotations

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import MessageRole, RunStatus
from app.models.message import Message
from app.models.run import Run


MAX_TURNS = 6  # Last 6 turns is plenty for short-term context.


async def build_conversation_preamble(
    *,
    session: AsyncSession,
    workflow_id,
    channel: str,
    chat_id: str,
) -> str:
    """Return a human-readable preamble for this chat's recent history.

    Empty string when there's no prior conversation. The agent's system
    prompt should mention this format so the model treats it as context
    rather than instructions.
    """
    # Find recent SUCCEEDED runs for this chat on this workflow.
    runs_q = (
        select(Run)
        .where(
            Run.workflow_id == workflow_id,
            Run.status == RunStatus.SUCCEEDED,
            Run.trigger == channel,
        )
        .order_by(desc(Run.created_at))
        .limit(MAX_TURNS)
        .options(selectinload(Run.messages))
    )
    result = await session.execute(runs_q)
    runs = [r for r in result.scalars() if r.input.get("chat_id") == chat_id]
    if not runs:
        return ""

    # Reverse so we present oldest-first.
    runs = list(reversed(runs))

    lines: list[str] = ["Recent conversation in this chat:"]
    for r in runs:
        user_text = r.input.get("input", "")
        # The agent's reply is the last AGENT-role message in the run.
        agent_msg = next(
            (m for m in reversed(sorted(r.messages, key=lambda m: m.created_at))
             if m.role == MessageRole.AGENT),
            None,
        )
        agent_text = agent_msg.content if agent_msg else "(no reply)"
        lines.append(f"User: {user_text}")
        lines.append(f"Assistant: {agent_text}")

    return "\n".join(lines)
