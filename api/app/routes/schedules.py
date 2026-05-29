"""Schedule routes — CRUD + manual trigger.

Schedules are cron-style triggers attached to a workflow. The scheduler
loop in worker.py fires them; these routes let the UI manage them.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import structlog
from croniter import croniter
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.models.enums import RunStatus, ScheduleStatus
from app.models.run import Run
from app.models.schedule import Schedule
from app.models.workflow import Workflow
from app.schemas.run import RunRead
from app.schemas.schedule import ScheduleCreate, ScheduleRead, ScheduleUpdate

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/schedules", tags=["schedules"])


def _compute_next_fire(cron: str, timezone: str) -> datetime:
    tz = ZoneInfo(timezone or "UTC")
    now_local = datetime.now(UTC).astimezone(tz)
    return croniter(cron, now_local).get_next(datetime).astimezone(UTC)


@router.get("", response_model=list[ScheduleRead])
async def list_schedules(s: AsyncSession = Depends(get_session)) -> list[Schedule]:
    result = await s.execute(select(Schedule).order_by(Schedule.created_at.desc()))
    return list(result.scalars())


@router.post("", response_model=ScheduleRead, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    body: ScheduleCreate,
    s: AsyncSession = Depends(get_session),
) -> Schedule:
    workflow = await s.get(Workflow, body.workflow_id)
    if workflow is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Workflow not found.")

    try:
        next_fire = _compute_next_fire(body.cron, body.timezone)
    except Exception as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    sched = Schedule(
        workflow_id=body.workflow_id,
        name=body.name,
        cron=body.cron,
        timezone=body.timezone,
        input=body.input,
        status=ScheduleStatus.ACTIVE,
        next_fire_at=next_fire,
    )
    s.add(sched)
    await s.commit()
    await s.refresh(sched)
    log.info("schedule_created", id=str(sched.id), workflow_id=str(body.workflow_id))
    return sched


@router.get("/{schedule_id}", response_model=ScheduleRead)
async def get_schedule(
    schedule_id: uuid.UUID,
    s: AsyncSession = Depends(get_session),
) -> Schedule:
    sched = await s.get(Schedule, schedule_id)
    if sched is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Schedule not found.")
    return sched


@router.patch("/{schedule_id}", response_model=ScheduleRead)
async def update_schedule(
    schedule_id: uuid.UUID,
    body: ScheduleUpdate,
    s: AsyncSession = Depends(get_session),
) -> Schedule:
    sched = await s.get(Schedule, schedule_id)
    if sched is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Schedule not found.")

    if body.name is not None:
        sched.name = body.name
    if body.input is not None:
        sched.input = body.input
    if body.status is not None:
        sched.status = body.status

    cron_changed = body.cron is not None or body.timezone is not None
    if body.cron is not None:
        sched.cron = body.cron
    if body.timezone is not None:
        sched.timezone = body.timezone
    if cron_changed:
        try:
            sched.next_fire_at = _compute_next_fire(sched.cron, sched.timezone)
        except Exception as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    await s.commit()
    await s.refresh(sched)
    return sched


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    schedule_id: uuid.UUID,
    s: AsyncSession = Depends(get_session),
) -> None:
    sched = await s.get(Schedule, schedule_id)
    if sched is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Schedule not found.")
    await s.delete(sched)
    await s.commit()


@router.post("/{schedule_id}/trigger", response_model=RunRead, status_code=status.HTTP_201_CREATED)
async def trigger_schedule(
    schedule_id: uuid.UUID,
    s: AsyncSession = Depends(get_session),
) -> Run:
    """Immediately create a PENDING run for this schedule (manual fire)."""
    sched = await s.get(Schedule, schedule_id)
    if sched is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Schedule not found.")

    run = Run(
        workflow_id=sched.workflow_id,
        status=RunStatus.PENDING,
        trigger="schedule_manual",
        input=sched.input,
    )
    s.add(run)
    await s.commit()
    await s.refresh(run)
    log.info("schedule_manually_triggered", schedule_id=str(schedule_id), run_id=str(run.id))
    return run
