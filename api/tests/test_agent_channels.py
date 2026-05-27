"""Agent-bound channel and skills endpoint tests."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient


async def _create_agent(client: AsyncClient, name: str, channel_kind: str | None = None) -> dict:
    payload: dict = {
        "name": name,
        "role": "test",
        "system_prompt": "Test agent.",
    }
    if channel_kind:
        payload["channel_kind"] = channel_kind
    resp = await client.post("/agents", json=payload)
    assert resp.status_code == 201
    return resp.json()


async def test_create_agent_bound_channel(client: AsyncClient) -> None:
    agent = await _create_agent(client, "TelegramBot1", "telegram")
    resp = await client.post(
        "/channels",
        json={
            "agent_id": agent["id"],
            "kind": "telegram",
            "external_id": "*",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["agent_id"] == agent["id"]

    # Cleanup
    await client.delete(f"/channels/{data['id']}")
    await client.delete(f"/agents/{agent['id']}")


async def test_channel_requires_agent_id(client: AsyncClient) -> None:
    resp = await client.post(
        "/channels",
        json={"kind": "telegram", "external_id": "chat_orphan"},
    )
    assert resp.status_code == 422


async def test_channel_unknown_agent_is_404(client: AsyncClient) -> None:
    resp = await client.post(
        "/channels",
        json={
            "agent_id": str(uuid.uuid4()),
            "kind": "telegram",
            "external_id": "chat_ghost",
        },
    )
    assert resp.status_code == 404


async def test_list_agent_channels(client: AsyncClient) -> None:
    agent = await _create_agent(client, "TelegramBot2", "telegram")
    ch_resp = await client.post(
        "/channels",
        json={
            "agent_id": agent["id"],
            "kind": "telegram",
            "external_id": "chat_999",
        },
    )
    assert ch_resp.status_code == 201
    channel_id = ch_resp.json()["id"]

    resp = await client.get(f"/agents/{agent['id']}/channels")
    assert resp.status_code == 200
    channels = resp.json()
    assert len(channels) == 1
    assert channels[0]["external_id"] == "chat_999"

    # Cleanup
    await client.delete(f"/channels/{channel_id}")
    await client.delete(f"/agents/{agent['id']}")


async def test_list_agent_schedules_empty(client: AsyncClient) -> None:
    agent = await _create_agent(client, "AgentNoSched")
    resp = await client.get(f"/agents/{agent['id']}/schedules")
    assert resp.status_code == 200
    assert resp.json() == []

    # Cleanup
    await client.delete(f"/agents/{agent['id']}")


async def test_skills_list(client: AsyncClient) -> None:
    resp = await client.get("/skills")
    assert resp.status_code == 200
    slugs = {s["slug"] for s in resp.json()}
    assert {"research", "writing", "analysis", "math", "translation"} == slugs


async def test_skills_detail(client: AsyncClient) -> None:
    resp = await client.get("/skills/research")
    assert resp.status_code == 200
    data = resp.json()
    assert "instructions" in data
    assert len(data["instructions"]) > 50


async def test_skills_detail_not_found(client: AsyncClient) -> None:
    resp = await client.get("/skills/nonexistent")
    assert resp.status_code == 404
