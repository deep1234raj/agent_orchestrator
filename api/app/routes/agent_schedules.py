"""Agent-scoped schedule routes.

All routes are nested under /agents/{agent_id}/schedules.
On first POST the agent's single-agent default workflow is lazily created
and its ID is stored in agent.default_workflow_id.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import structlog
from croniter import croniter
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.models.agent import Agent
from app.models.enums import RunStatus, ScheduleStatus
from app.models.run import Run
from app.models.schedule import Schedule
from app.models.workflow import Workflow
from app.schemas.run import RunRead
from app.schemas.schedule import AgentScheduleCreate, ScheduleRead, ScheduleUpdate

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/agents/{agent_id}/schedules", tags=["agent-schedules"])


def _compute_next_fire(cron: str, timezone: str) -> datetime:
    tz = ZoneInfo(timezone or "UTC")
    now_local = datetime.now(UTC).astimezone(tz)
    return croniter(cron, now_local).get_next(datetime).astimezone(UTC)


async def _get_agent_or_404(agent_id: uuid.UUID, s: AsyncSession) -> Agent:
    agent = await s.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Agent not found.")
    return agent


async def _ensure_default_workflow(agent: Agent, s: AsyncSession) -> uuid.UUID:
    """Return agent.default_workflow_id, creating the workflow if needed.

    Uses try/except IntegrityError to handle the rare concurrent-POST race
    where two requests simultaneously find default_workflow_id is None and
    both attempt to create the workflow.
    """
    if agent.default_workflow_id is not None:
        return agent.default_workflow_id

    wf = Workflow(
        name=f"{agent.name} (default)",
        description=f"Auto-created single-agent workflow for agent '{agent.name}'.",
        graph={
            "nodes": [
                {"id": "start", "type": "start"},
                {"id": "agent_node", "type": "agent", "data": {"agent_id": str(agent.id)}},
                {"id": "end_node", "type": "end"},
            ],
            "edges": [
                {"id": "e1", "source": "start", "target": "agent_node"},
                {"id": "e2", "source": "agent_node", "target": "end_node"},
            ],
        },
    )
    s.add(wf)
    try:
        await s.flush()
    except IntegrityError:
        await s.rollback()
        # Another request won the race — re-fetch the agent to get the workflow ID it set.
        refreshed = await s.get(Agent, agent.id)
        if refreshed is None or refreshed.default_workflow_id is None:
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create default workflow.",
            ) from None
        return refreshed.default_workflow_id

    agent.default_workflow_id = wf.id
    await s.flush()
    log.info("default_workflow_created", agent_id=str(agent.id), workflow_id=str(wf.id))
    return wf.id


async def _get_schedule_for_agent(
    schedule_id: uuid.UUID, agent: Agent, s: AsyncSession
) -> Schedule:
    sched = await s.get(Schedule, schedule_id)
    if sched is None or sched.workflow_id != agent.default_workflow_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Schedule not found.")
    return sched


@router.get("", response_model=list[ScheduleRead])
async def list_agent_schedules(
    agent_id: uuid.UUID,
    s: AsyncSession = Depends(get_session),
) -> list[Schedule]:
    agent = await _get_agent_or_404(agent_id, s)
    if agent.default_workflow_id is None:
        return []
    result = await s.execute(
        select(Schedule)
        .where(Schedule.workflow_id == agent.default_workflow_id)
        .order_by(Schedule.created_at.desc())
    )
    return list(result.scalars())


@router.post("", response_model=ScheduleRead, status_code=status.HTTP_201_CREATED)
async def create_agent_schedule(
    agent_id: uuid.UUID,
    body: AgentScheduleCreate,
    s: AsyncSession = Depends(get_session),
) -> Schedule:
    agent = await _get_agent_or_404(agent_id, s)
    workflow_id = await _ensure_default_workflow(agent, s)

    try:
        next_fire = _compute_next_fire(body.cron, body.timezone)
    except Exception as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    sched = Schedule(
        workflow_id=workflow_id,
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
    log.info("agent_schedule_created", agent_id=str(agent_id), schedule_id=str(sched.id))
    return sched


@router.patch("/{schedule_id}", response_model=ScheduleRead)
async def update_agent_schedule(
    agent_id: uuid.UUID,
    schedule_id: uuid.UUID,
    body: ScheduleUpdate,
    s: AsyncSession = Depends(get_session),
) -> Schedule:
    agent = await _get_agent_or_404(agent_id, s)
    sched = await _get_schedule_for_agent(schedule_id, agent, s)

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
async def delete_agent_schedule(
    agent_id: uuid.UUID,
    schedule_id: uuid.UUID,
    s: AsyncSession = Depends(get_session),
) -> None:
    agent = await _get_agent_or_404(agent_id, s)
    sched = await _get_schedule_for_agent(schedule_id, agent, s)
    await s.delete(sched)
    await s.commit()


@router.post(
    "/{schedule_id}/trigger",
    response_model=RunRead,
    status_code=status.HTTP_201_CREATED,
)
async def trigger_agent_schedule(
    agent_id: uuid.UUID,
    schedule_id: uuid.UUID,
    s: AsyncSession = Depends(get_session),
) -> Run:
    agent = await _get_agent_or_404(agent_id, s)
    sched = await _get_schedule_for_agent(schedule_id, agent, s)

    run = Run(
        workflow_id=sched.workflow_id,
        status=RunStatus.PENDING,
        trigger="schedule_manual",
        input=sched.input,
    )
    s.add(run)
    await s.commit()
    await s.refresh(run)
    log.info(
        "agent_schedule_manually_triggered",
        agent_id=str(agent_id),
        schedule_id=str(schedule_id),
        run_id=str(run.id),
    )
    return run
