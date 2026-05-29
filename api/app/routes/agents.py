"""Agent CRUD routes."""

from __future__ import annotations

import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.channels.telegram import TelegramChannel
from app.db.session import get_session
from app.errors import BadRequest, Conflict, NotFound
from app.models.agent import Agent
from app.models.channel import Channel
from app.schemas.agent import AgentCreate, AgentRead, AgentUpdate
from app.schemas.channel import ChannelRead


class RegisterWebhookRequest(BaseModel):
    base_url: str
    bot_token: str

    @field_validator("base_url")
    @classmethod
    def must_be_https(cls, v: str) -> str:
        if not v.startswith("https://"):
            raise ValueError("base_url must start with https://")
        return v.rstrip("/")


class RegisterWebhookResponse(BaseModel):
    ok: bool
    description: str | None = None


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
        raise Conflict("Agent with this name already exists.") from e
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


@router.post("/{agent_id}/register-webhook", response_model=RegisterWebhookResponse)
async def register_agent_webhook(
    agent_id: uuid.UUID,
    body: RegisterWebhookRequest,
    s: AsyncSession = Depends(get_session),
) -> RegisterWebhookResponse:
    agent = await s.get(Agent, agent_id)
    if agent is None:
        raise NotFound(f"Agent {agent_id} not found.")
    if agent.channel_kind != "telegram":
        raise BadRequest("Only telegram channel agents support webhook registration.")

    webhook_secret = (agent.channel_config or {}).get("webhook_secret")
    channel = TelegramChannel(bot_token=body.bot_token, webhook_secret=webhook_secret)
    webhook_url = f"{body.base_url}/webhooks/telegram/{agent_id}"

    try:
        data = await channel.register_webhook(webhook_url)
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

    return RegisterWebhookResponse(ok=True, description=data.get("description"))


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
