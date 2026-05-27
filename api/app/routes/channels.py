"""Channel binding routes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.errors import Conflict, NotFound
from app.models.agent import Agent
from app.models.channel import Channel
from app.schemas.channel import ChannelCreate, ChannelRead, ChannelUpdate

router = APIRouter(prefix="/channels", tags=["channels"])


@router.get("", response_model=list[ChannelRead])
async def list_channels(s: AsyncSession = Depends(get_session)) -> list[Channel]:
    result = await s.execute(select(Channel).order_by(Channel.created_at.desc()))
    return list(result.scalars())


@router.post("", response_model=ChannelRead, status_code=status.HTTP_201_CREATED)
async def create_channel(body: ChannelCreate, s: AsyncSession = Depends(get_session)) -> Channel:
    if await s.get(Agent, body.agent_id) is None:
        raise NotFound(f"Agent {body.agent_id} not found.")

    channel = Channel(**body.model_dump())
    s.add(channel)
    try:
        await s.commit()
    except IntegrityError as e:
        await s.rollback()
        raise Conflict(
            f"A channel for {body.kind.value} {body.external_id!r} already exists."
        ) from e
    await s.refresh(channel)
    return channel


@router.patch("/{channel_id}", response_model=ChannelRead)
async def update_channel(
    channel_id: uuid.UUID,
    body: ChannelUpdate,
    s: AsyncSession = Depends(get_session),
) -> Channel:
    channel = await s.get(Channel, channel_id)
    if channel is None:
        raise NotFound(f"Channel {channel_id} not found.")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(channel, field, value)
    await s.commit()
    await s.refresh(channel)
    return channel


@router.delete("/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_channel(channel_id: uuid.UUID, s: AsyncSession = Depends(get_session)) -> None:
    channel = await s.get(Channel, channel_id)
    if channel is None:
        raise NotFound(f"Channel {channel_id} not found.")
    await s.delete(channel)
    await s.commit()
