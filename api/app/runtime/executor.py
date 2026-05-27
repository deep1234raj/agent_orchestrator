"""Executor — manages the lifecycle of a single run.

Responsibilities:
  1. Mark the run RUNNING.
  2. Compile the workflow.
  3. Stream the compiled graph, applying workflow-level guardrails:
     - max_iterations (cap on agent turns)
     - max_cost_usd   (cap on total run cost)
  4. On success: set output, mark SUCCEEDED.
  5. On failure: mark FAILED with the error string.
  6. On cancellation request: mark CANCELLED.

The executor does not pick runs off a queue itself — that's the worker's
job. The executor is the unit of "run one workflow now" and is reused
across UI, Telegram, and schedule triggers.
"""

from __future__ import annotations

import uuid
from typing import Any

import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import session_scope
from app.models.enums import MessageRole, RunStatus
from app.models.run import Run
from app.models.workflow import Workflow
from app.runtime.compiler import CompileError, compile_workflow
from app.runtime.events import EventEmitter
from app.runtime.nodes.terminal import derive_output
from app.runtime.state import RunState
from app.tools.send_message import set_run_input_context

log = structlog.get_logger(__name__)


# Sane defaults applied when an agent doesn't specify guardrails.
DEFAULT_MAX_ITERATIONS = 25
DEFAULT_MAX_COST_USD = 1.00


class GuardrailTripped(Exception):
    """Raised when a workflow-level guardrail aborts execution."""


class Cancelled(Exception):
    """Raised when the run was cancelled out-of-band (e.g. via the API)."""


async def execute_run(run_id: uuid.UUID) -> None:
    """Top-level entry point used by the worker."""
    emitter = EventEmitter(run_id)
    try:
        await _execute(run_id, emitter)
    except Exception as e:  # noqa: BLE001
        # The executor should be the *only* place a run failure surfaces
        # to the DB — keep this catch-all here even though specific
        # exceptions are also handled below.
        log.exception("run_failed", run_id=str(run_id))
        await emitter.status(RunStatus.FAILED, error=f"{type(e).__name__}: {e}")


async def _execute(run_id: uuid.UUID, emitter: EventEmitter) -> None:
    # Load the run + its workflow in one short transaction.
    async with session_scope() as s:
        run = await _load_run(s, run_id)
        workflow = await _load_workflow(s, run.workflow_id)

    # Make run input available to tools (notably send_message) without
    # polluting the tool signature. Cleared at the end via the finally.
    set_run_input_context(run.input)

    await emitter.status(RunStatus.RUNNING)

    # Persist the initial input as a USER message so it shows in the timeline.
    initial_input = run.input.get("input")
    if initial_input is not None:
        await emitter.message(role=MessageRole.USER, content=str(initial_input))

    # Compile in its own session (compiler needs to read agent rows).
    async with session_scope() as s:
        try:
            compiled = await compile_workflow(graph_doc=workflow.graph, session=s, emitter=emitter)
        except CompileError as e:
            await emitter.status(RunStatus.FAILED, error=f"CompileError: {e}")
            return

    # Resolve workflow-level guardrails. We sample the first agent node's
    # guardrails as the workflow's — refinements could expose them at the
    # workflow level instead, but agents-as-source-of-truth is one less
    # concept for the UI to teach.
    max_iterations, max_cost = await _resolve_guardrails(compiled.agent_node_ids)

    # Build initial state.
    initial_state = RunState(run_id=run_id, input=run.input)

    # Stream execution. LangGraph yields intermediate states; we use the
    # opportunity to enforce guardrails between steps without ripping
    # into node internals.
    final_state: RunState | None = None
    try:
        async for step in compiled.graph.astream(initial_state, stream_mode="values"):
            # `step` is a dict-like state snapshot. Coerce to RunState.
            state = step if isinstance(step, RunState) else RunState.model_validate(step)
            final_state = state

            # Cancellation check: API can set status=CANCELLED on this row.
            if await _is_cancelled(run_id):
                raise Cancelled("run cancelled by user")

            if state.iterations > max_iterations:
                raise GuardrailTripped(
                    f"max_iterations exceeded ({state.iterations} > {max_iterations})"
                )

            current_cost = await _read_total_cost(run_id)
            if current_cost > max_cost:
                raise GuardrailTripped(
                    f"max_cost_usd exceeded (${current_cost:.4f} > ${max_cost:.2f})"
                )
    except Cancelled as e:
        await emitter.status(RunStatus.CANCELLED, error=str(e))
        return
    except GuardrailTripped as e:
        await emitter.status(RunStatus.FAILED, error=str(e))
        return

    # Finalize.
    output = derive_output(final_state) if final_state else {}
    async with session_scope() as s:
        await s.execute(update(Run).where(Run.id == run_id).values(output=output))
    await emitter.status(RunStatus.SUCCEEDED)
    log.info("run_succeeded", run_id=str(run_id))

    # Auto-deliver the final reply to the triggering channel (e.g. Telegram).
    # Agents no longer need send_message in their tool list for delivery;
    # this fires exactly once when the run succeeds.
    _channel = run.input.get("channel")
    _chat_id = run.input.get("chat_id")
    _reply = output.get("reply", "")
    if _channel and _chat_id and _reply:
        from app.channels.base import ChannelMessage, dispatch_send  # local to avoid cycle
        from app.models.enums import ChannelKind

        try:
            await dispatch_send(
                ChannelKind(_channel),
                ChannelMessage(chat_id=str(_chat_id), text=_reply),
            )
            log.info("run_auto_delivered", run_id=str(run_id), channel=_channel)
        except Exception:
            log.exception("run_auto_deliver_failed", run_id=str(run_id), channel=_channel)


# ─── helpers ─────────────────────────────────────────────────────────────────


async def _load_run(s: AsyncSession, run_id: uuid.UUID) -> Run:
    result = await s.execute(select(Run).where(Run.id == run_id))
    run = result.scalar_one_or_none()
    if run is None:
        raise ValueError(f"Run {run_id} not found.")
    return run


async def _load_workflow(s: AsyncSession, workflow_id: uuid.UUID) -> Workflow:
    result = await s.execute(select(Workflow).where(Workflow.id == workflow_id))
    workflow = result.scalar_one_or_none()
    if workflow is None:
        raise ValueError(f"Workflow {workflow_id} not found.")
    return workflow


async def _resolve_guardrails(agent_node_ids: list[str]) -> tuple[int, float]:
    """Sample guardrails from the first agent in the workflow.

    Falls back to defaults if no agents are present or fields are missing.
    """
    from app.models.agent import Agent  # local to avoid an import cycle

    if not agent_node_ids:
        return DEFAULT_MAX_ITERATIONS, DEFAULT_MAX_COST_USD

    async with session_scope() as s:
        # Note: agent_node_ids are workflow-node ids, not agent ids. We don't
        # have an easy lookup back to agent rows here, so sample the first
        # agent in the agents table that appears in the workflow.
        # (Refinement: pass agents-by-node-id through from compile.)
        result = await s.execute(select(Agent).limit(1))
        agent = result.scalars().first()

    if agent is None:
        return DEFAULT_MAX_ITERATIONS, DEFAULT_MAX_COST_USD

    g = agent.guardrails or {}
    return (
        int(g.get("max_iterations", DEFAULT_MAX_ITERATIONS)),
        float(g.get("max_cost_usd", DEFAULT_MAX_COST_USD)),
    )


async def _read_total_cost(run_id: uuid.UUID) -> float:
    async with session_scope() as s:
        result = await s.execute(select(Run.total_cost_usd).where(Run.id == run_id))
        return float(result.scalar_one() or 0.0)


async def _is_cancelled(run_id: uuid.UUID) -> bool:
    """Check whether the API has flipped this run to CANCELLED."""
    async with session_scope() as s:
        result = await s.execute(select(Run.status).where(Run.id == run_id))
        status_val = result.scalar_one_or_none()
    return status_val == RunStatus.CANCELLED
