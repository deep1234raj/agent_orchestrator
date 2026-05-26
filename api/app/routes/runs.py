"""Run routes — read-only plus cancel."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_session
from app.errors import BadRequest, NotFound
from app.models.enums import RunStatus
from app.models.run import Run
from app.schemas.run import (
    MessageRead,
    RunDetail,
    RunRead,
    ToolCallRead,
    UsageEventRead,
)

router = APIRouter(prefix="/runs", tags=["runs"])


@router.get("", response_model=list[RunRead])
async def list_runs(
    workflow_id: uuid.UUID | None = Query(default=None),
    status_filter: RunStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    s: AsyncSession = Depends(get_session),
) -> list[Run]:
    stmt = select(Run).order_by(Run.created_at.desc()).limit(limit)
    if workflow_id is not None:
        stmt = stmt.where(Run.workflow_id == workflow_id)
    if status_filter is not None:
        stmt = stmt.where(Run.status == status_filter)
    result = await s.execute(stmt)
    return list(result.scalars())


@router.get("/{run_id}", response_model=RunDetail)
async def get_run(
    run_id: uuid.UUID, s: AsyncSession = Depends(get_session)
) -> RunDetail:
    """Returns the run plus its full message log, tool calls, and usage."""
    result = await s.execute(
        select(Run)
        .where(Run.id == run_id)
        .options(
            selectinload(Run.messages),
            selectinload(Run.tool_calls),
            selectinload(Run.usage_events),
        )
    )
    run = result.scalar_one_or_none()
    if run is None:
        raise NotFound(f"Run {run_id} not found.")

    # Hand-construct RunDetail so we control the message order (ascending)
    # which differs from the parent ordering (descending).
    return RunDetail(
        id=run.id,
        workflow_id=run.workflow_id,
        status=run.status,
        trigger=run.trigger,
        input=run.input,
        output=run.output,
        error=run.error,
        started_at=run.started_at,
        finished_at=run.finished_at,
        total_tokens=run.total_tokens,
        total_cost_usd=run.total_cost_usd,
        created_at=run.created_at,
        updated_at=run.updated_at,
        messages=[MessageRead.model_validate(m) for m in
                  sorted(run.messages, key=lambda m: m.created_at)],
        tool_calls=[ToolCallRead.model_validate(tc) for tc in
                    sorted(run.tool_calls, key=lambda t: t.created_at)],
        usage_events=[UsageEventRead.model_validate(u) for u in
                      sorted(run.usage_events, key=lambda u: u.created_at)],
    )


@router.post("/{run_id}/cancel", response_model=RunRead)
async def cancel_run(
    run_id: uuid.UUID, s: AsyncSession = Depends(get_session)
) -> Run:
    """Request cancellation.

    PENDING runs are cancelled immediately. RUNNING runs are marked
    CANCELLED and the executor notices between graph steps.
    """
    run = await s.get(Run, run_id)
    if run is None:
        raise NotFound(f"Run {run_id} not found.")
    if run.status not in (RunStatus.PENDING, RunStatus.RUNNING):
        raise BadRequest(
            f"Run is in terminal state {run.status.value}; cannot cancel."
        )
    run.status = RunStatus.CANCELLED
    await s.commit()
    await s.refresh(run)
    return run
