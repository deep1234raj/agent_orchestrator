"""Agent CRUD routes."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.errors import Conflict, NotFound
from app.models.agent import Agent
from app.schemas.agent import AgentCreate, AgentRead, AgentUpdate

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("", response_model=list[AgentRead])
async def list_agents(s: AsyncSession = Depends(get_session)) -> list[Agent]:
    result = await s.execute(select(Agent).order_by(Agent.created_at.desc()))
    return list(result.scalars())


@router.post("", response_model=AgentRead, status_code=status.HTTP_201_CREATED)
async def create_agent(
    body: AgentCreate, s: AsyncSession = Depends(get_session)
) -> Agent:
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
async def get_agent(
    agent_id: uuid.UUID, s: AsyncSession = Depends(get_session)
) -> Agent:
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
async def delete_agent(
    agent_id: uuid.UUID, s: AsyncSession = Depends(get_session)
) -> None:
    agent = await s.get(Agent, agent_id)
    if agent is None:
        raise NotFound(f"Agent {agent_id} not found.")
    await s.delete(agent)
    await s.commit()
