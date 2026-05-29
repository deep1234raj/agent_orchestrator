"""Tests for agent-scoped schedule endpoints."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient


@pytest.fixture
async def agent(client: AsyncClient) -> dict:
    resp = await client.post(
        "/agents",
        json={
            "name": f"sched-test-{uuid.uuid4().hex[:8]}",
            "role": "Scheduler test",
            "system_prompt": "You schedule things.",
            "provider": "anthropic",
            "model": "claude-sonnet-4-5",
            "temperature": 0.7,
            "max_tokens": 512,
            "tools": [],
            "memory_mode": "summary",
            "memory_window": 5,
            "guardrails": {},
            "skills": [],
            "interaction_rules": {},
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_list_schedules_empty_before_creation(client: AsyncClient, agent: dict) -> None:
    resp = await client.get(f"/agents/{agent['id']}/schedules")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_create_schedule_creates_default_workflow(client: AsyncClient, agent: dict) -> None:
    resp = await client.post(
        f"/agents/{agent['id']}/schedules",
        json={"name": "Hourly check", "cron": "0 * * * *", "timezone": "UTC"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["name"] == "Hourly check"
    assert data["cron"] == "0 * * * *"
    assert data["status"] == "active"
    assert data["next_fire_at"] is not None

    # Agent should now have a default_workflow_id
    agent_resp = await client.get(f"/agents/{agent['id']}")
    assert agent_resp.status_code == 200
    assert agent_resp.json()["default_workflow_id"] is not None


async def test_create_second_schedule_reuses_default_workflow(
    client: AsyncClient, agent: dict
) -> None:
    await client.post(
        f"/agents/{agent['id']}/schedules",
        json={"name": "First", "cron": "0 * * * *"},
    )
    first_agent = (await client.get(f"/agents/{agent['id']}")).json()
    wf_id = first_agent["default_workflow_id"]

    await client.post(
        f"/agents/{agent['id']}/schedules",
        json={"name": "Second", "cron": "0 9 * * *"},
    )
    second_agent = (await client.get(f"/agents/{agent['id']}")).json()
    assert second_agent["default_workflow_id"] == wf_id  # same workflow reused


async def test_list_schedules_after_creation(client: AsyncClient, agent: dict) -> None:
    await client.post(
        f"/agents/{agent['id']}/schedules",
        json={"name": "Daily", "cron": "0 9 * * *"},
    )
    resp = await client.get(f"/agents/{agent['id']}/schedules")
    assert resp.status_code == 200
    schedules = resp.json()
    assert len(schedules) >= 1
    assert schedules[0]["name"] == "Daily"


async def test_pause_and_resume_schedule(client: AsyncClient, agent: dict) -> None:
    create_resp = await client.post(
        f"/agents/{agent['id']}/schedules",
        json={"name": "Pause test", "cron": "*/5 * * * *"},
    )
    sched_id = create_resp.json()["id"]

    pause_resp = await client.patch(
        f"/agents/{agent['id']}/schedules/{sched_id}",
        json={"status": "paused"},
    )
    assert pause_resp.status_code == 200
    assert pause_resp.json()["status"] == "paused"

    resume_resp = await client.patch(
        f"/agents/{agent['id']}/schedules/{sched_id}",
        json={"status": "active"},
    )
    assert resume_resp.json()["status"] == "active"


async def test_delete_schedule(client: AsyncClient, agent: dict) -> None:
    create_resp = await client.post(
        f"/agents/{agent['id']}/schedules",
        json={"name": "To delete", "cron": "0 0 * * *"},
    )
    sched_id = create_resp.json()["id"]

    del_resp = await client.delete(f"/agents/{agent['id']}/schedules/{sched_id}")
    assert del_resp.status_code == 204

    list_resp = await client.get(f"/agents/{agent['id']}/schedules")
    ids = [s["id"] for s in list_resp.json()]
    assert sched_id not in ids


async def test_trigger_schedule_creates_run(client: AsyncClient, agent: dict) -> None:
    create_resp = await client.post(
        f"/agents/{agent['id']}/schedules",
        json={"name": "Trigger test", "cron": "0 12 * * *"},
    )
    sched_id = create_resp.json()["id"]

    trigger_resp = await client.post(f"/agents/{agent['id']}/schedules/{sched_id}/trigger")
    assert trigger_resp.status_code == 201
    run = trigger_resp.json()
    assert run["status"] == "pending"
    assert run["trigger"] == "schedule_manual"


async def test_invalid_cron_rejected(client: AsyncClient, agent: dict) -> None:
    resp = await client.post(
        f"/agents/{agent['id']}/schedules",
        json={"name": "Bad cron", "cron": "not-a-cron"},
    )
    assert resp.status_code == 422
