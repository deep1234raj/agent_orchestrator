"""EventEmitter — the single channel through which the runtime communicates.

Every meaningful step in a run produces an event. Events are:
  1. Persisted to the appropriate table (messages / tool_calls / usage_events
     / runs status).
  2. Published to an in-process pub/sub that the WS gateway subscribes to.

This is how we satisfy "agents communicate asynchronously" AND "messages are
persisted AND visible in the UI" with one mechanism: Postgres is the source
of truth; the pub/sub is the read-through cache that keeps the UI live.

The pub/sub is intentionally trivial — a dict of asyncio.Queues keyed by
run_id. The WS gateway subscribes by appending its queue; the emitter
publishes by put-ing into every subscriber's queue. No Redis required.
"""

from __future__ import annotations

import asyncio
import uuid
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any, Literal

import structlog
from pydantic import BaseModel, Field
from sqlalchemy import update

from app.db.session import session_scope
from app.models.enums import MessageRole, RunStatus
from app.models.message import Message
from app.models.run import Run
from app.models.tool_call import ToolCall
from app.models.usage_event import UsageEvent
from app.runtime.pricing import compute_cost_usd

log = structlog.get_logger(__name__)


EventType = Literal[
    "status",
    "message",
    "tool_call",
    "tool_result",
    "agent_started",
    "agent_finished",
    "usage",
]


class Event(BaseModel):
    """Normalized envelope sent over the WebSocket."""

    run_id: uuid.UUID
    ts: datetime = Field(default_factory=lambda: datetime.now(UTC))
    type: EventType
    payload: dict[str, Any] = Field(default_factory=dict)


# ─────────────────────────────────────────────────────────────────────────────
# In-process pub/sub
# ─────────────────────────────────────────────────────────────────────────────

# run_id -> set of subscriber queues
_subscribers: dict[uuid.UUID, set[asyncio.Queue[Event]]] = defaultdict(set)
_lock = asyncio.Lock()


async def subscribe(run_id: uuid.UUID) -> asyncio.Queue[Event]:
    """WS gateway calls this on connect. Returns a queue that receives events."""
    q: asyncio.Queue[Event] = asyncio.Queue(maxsize=1000)
    async with _lock:
        _subscribers[run_id].add(q)
    return q


async def unsubscribe(run_id: uuid.UUID, q: asyncio.Queue[Event]) -> None:
    """WS gateway calls this on disconnect."""
    async with _lock:
        _subscribers[run_id].discard(q)
        if not _subscribers[run_id]:
            _subscribers.pop(run_id, None)


async def _broadcast(event: Event) -> None:
    """Fan-out a single event to every subscriber of its run."""
    async with _lock:
        targets = list(_subscribers.get(event.run_id, ()))
    for q in targets:
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            # Slow consumer. Drop the event rather than block the runtime.
            log.warning("ws_subscriber_queue_full", run_id=str(event.run_id))


# ─────────────────────────────────────────────────────────────────────────────
# Emitter API used by the runtime
# ─────────────────────────────────────────────────────────────────────────────


class EventEmitter:
    """Bound to a single run. Persists and broadcasts events.

    Construct one of these at the start of a run and pass it into every
    node. It owns no state beyond the run_id.
    """

    def __init__(self, run_id: uuid.UUID) -> None:
        self.run_id = run_id

    # ── status ────────────────────────────────────────────────────────────
    async def status(self, status: RunStatus, *, error: str | None = None) -> None:
        async with session_scope() as s:
            values: dict[str, Any] = {"status": status}
            now = datetime.now(UTC)
            if status == RunStatus.RUNNING:
                values["started_at"] = now
            elif status in (RunStatus.SUCCEEDED, RunStatus.FAILED, RunStatus.CANCELLED):
                values["finished_at"] = now
                if error is not None:
                    values["error"] = error
            await s.execute(update(Run).where(Run.id == self.run_id).values(**values))

        await _broadcast(
            Event(
                run_id=self.run_id,
                type="status",
                payload={"status": status.value, "error": error},
            )
        )

    # ── messages ──────────────────────────────────────────────────────────
    async def message(
        self,
        role: MessageRole,
        content: str,
        *,
        agent_id: uuid.UUID | None = None,
        agent_name: str | None = None,
        meta: dict[str, Any] | None = None,
    ) -> uuid.UUID:
        """Persist a message and broadcast. Returns the new message id."""
        meta = meta or {}
        async with session_scope() as s:
            msg = Message(
                run_id=self.run_id,
                agent_id=agent_id,
                role=role,
                content=content,
                meta=meta,
            )
            s.add(msg)
            await s.flush()
            msg_id = msg.id

        await _broadcast(
            Event(
                run_id=self.run_id,
                type="message",
                payload={
                    "id": str(msg_id),
                    "role": role.value,
                    "content": content,
                    "agent_id": str(agent_id) if agent_id else None,
                    "agent_name": agent_name,
                    "meta": meta,
                },
            )
        )
        return msg_id

    # ── tool calls ────────────────────────────────────────────────────────
    async def tool_call_start(
        self,
        *,
        agent_id: uuid.UUID,
        tool_name: str,
        arguments: dict[str, Any],
    ) -> uuid.UUID:
        async with session_scope() as s:
            tc = ToolCall(
                run_id=self.run_id,
                agent_id=agent_id,
                tool_name=tool_name,
                arguments=arguments,
            )
            s.add(tc)
            await s.flush()
            tc_id = tc.id

        await _broadcast(
            Event(
                run_id=self.run_id,
                type="tool_call",
                payload={
                    "id": str(tc_id),
                    "agent_id": str(agent_id),
                    "tool_name": tool_name,
                    "arguments": arguments,
                },
            )
        )
        return tc_id

    async def tool_call_finish(
        self,
        tool_call_id: uuid.UUID,
        *,
        result: dict[str, Any] | None = None,
        error: str | None = None,
        duration_ms: float | None = None,
    ) -> None:
        async with session_scope() as s:
            await s.execute(
                update(ToolCall)
                .where(ToolCall.id == tool_call_id)
                .values(result=result, error=error, duration_ms=duration_ms)
            )

        await _broadcast(
            Event(
                run_id=self.run_id,
                type="tool_result",
                payload={
                    "id": str(tool_call_id),
                    "result": result,
                    "error": error,
                    "duration_ms": duration_ms,
                },
            )
        )

    # ── agent lifecycle ───────────────────────────────────────────────────
    async def agent_started(self, agent_id: uuid.UUID, agent_name: str) -> None:
        await _broadcast(
            Event(
                run_id=self.run_id,
                type="agent_started",
                payload={"agent_id": str(agent_id), "agent_name": agent_name},
            )
        )

    async def agent_finished(self, agent_id: uuid.UUID, agent_name: str) -> None:
        await _broadcast(
            Event(
                run_id=self.run_id,
                type="agent_finished",
                payload={"agent_id": str(agent_id), "agent_name": agent_name},
            )
        )

    # ── usage / cost ──────────────────────────────────────────────────────
    async def usage(
        self,
        *,
        agent_id: uuid.UUID,
        provider: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
    ) -> float:
        """Record a usage event and increment the run's denormalized totals.

        Returns the cost of *this* call. Caller (the executor) uses the
        return value to check the max_cost guardrail without re-querying.
        """
        cost = compute_cost_usd(provider, model, input_tokens, output_tokens)
        total_tokens = input_tokens + output_tokens

        async with session_scope() as s:
            s.add(
                UsageEvent(
                    run_id=self.run_id,
                    agent_id=agent_id,
                    provider=provider,
                    model=model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    cost_usd=cost,
                )
            )
            # Increment denormalized totals on the run.
            await s.execute(
                update(Run)
                .where(Run.id == self.run_id)
                .values(
                    total_tokens=Run.total_tokens + total_tokens,
                    total_cost_usd=Run.total_cost_usd + cost,
                )
            )

        await _broadcast(
            Event(
                run_id=self.run_id,
                type="usage",
                payload={
                    "agent_id": str(agent_id),
                    "provider": provider,
                    "model": model,
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "cost_usd": cost,
                },
            )
        )
        return cost
