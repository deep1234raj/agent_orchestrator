"""Agent CRUD routes."""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.errors import Conflict, NotFound
from app.models.agent import Agent
from app.models.channel import Channel
from app.models.schedule import Schedule
from app.models.workflow import Workflow
from app.schemas.agent import AgentCreate, AgentRead, AgentUpdate
from app.schemas.channel import ChannelRead
from app.schemas.schedule import ScheduleRead

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("", response_model=list[AgentRead])
async def list_agents(s: AsyncSession = Depends(get_session)) -> list[Agent]:
    result = await s.execute(select(Agent).order_by(Agent.created_at.desc()))
    return list(result.scalars())


@router.post("", response_model=AgentRead, status_code=status.HTTP_201_CREATED)
async def create_agent(body: AgentCreate, s: AsyncSession = Depends(get_session)) -> Agent:
    agent = Agent(**body.model_dump())
    s.add(agent)
    try:
        await s.commit()
    except IntegrityError as e:
        await s.rollback()
        raise Conflict(f"Agent with this name already exists.") from e
    await s.refresh(agent)
    return agent


@router.get("/{agent_id}", response_model=AgentRead)
async def get_agent(agent_id: uuid.UUID, s: AsyncSession = Depends(get_session)) -> Agent:
    agent = await s.get(Agent, agent_id)
    if agent is None:
        raise NotFound(f"Agent {agent_id} not found.")
    return agent


@router.patch("/{agent_id}", response_model=AgentRead)
async def update_agent(
    agent_id: uuid.UUID,
    body: AgentUpdate,
    s: AsyncSession = Depends(get_session),
) -> Agent:
    agent = await s.get(Agent, agent_id)
    if agent is None:
        raise NotFound(f"Agent {agent_id} not found.")

    # Apply only provided fields.
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(agent, field, value)

    try:
        await s.commit()
    except IntegrityError as e:
        await s.rollback()
        raise Conflict("Update violates a uniqueness constraint.") from e
    await s.refresh(agent)
    return agent


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(agent_id: uuid.UUID, s: AsyncSession = Depends(get_session)) -> None:
    agent = await s.get(Agent, agent_id)
    if agent is None:
        raise NotFound(f"Agent {agent_id} not found.")
    await s.delete(agent)
    await s.commit()


@router.get("/{agent_id}/channels", response_model=list[ChannelRead])
async def list_agent_channels(
    agent_id: uuid.UUID,
    s: AsyncSession = Depends(get_session),
) -> list[Channel]:
    if await s.get(Agent, agent_id) is None:
        raise NotFound(f"Agent {agent_id} not found.")
    result = await s.execute(
        select(Channel)
        .where(Channel.agent_id == agent_id, Channel.enabled.is_(True))
        .order_by(Channel.created_at.desc())
    )
    return list(result.scalars())


@router.get("/{agent_id}/schedules", response_model=list[ScheduleRead])
async def list_agent_schedules(
    agent_id: uuid.UUID,
    s: AsyncSession = Depends(get_session),
) -> list[Schedule]:
    if await s.get(Agent, agent_id) is None:
        raise NotFound(f"Agent {agent_id} not found.")

    wf_result = await s.execute(
        select(Workflow).where(Workflow.graph.cast(sa.Text).contains(str(agent_id)))
    )
    workflow_ids = [w.id for w in wf_result.scalars()]
    if not workflow_ids:
        return []

    sched_result = await s.execute(
        select(Schedule)
        .where(Schedule.workflow_id.in_(workflow_ids))
        .order_by(Schedule.created_at.desc())
    )
    return list(sched_result.scalars())
