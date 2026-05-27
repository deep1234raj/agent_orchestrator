"""Agent CRUD tests — covers new fields: channel_kind, channel_config, skills, interaction_rules."""

from __future__ import annotations

from httpx import AsyncClient

_BASE_AGENT = {
    "name": "TestBot",
    "role": "test",
    "system_prompt": "You are a test agent.",
}


async def test_create_agent_minimal(client: AsyncClient) -> None:
    resp = await client.post("/agents", json=_BASE_AGENT)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "TestBot"
    # New fields should default to empty/None.
    assert data["channel_kind"] is None
    assert data["channel_config"] == {}
    assert data["skills"] == []
    assert data["interaction_rules"] == {}

    # Cleanup
    await client.delete(f"/agents/{data['id']}")


async def test_create_agent_with_channel_skills_interaction_rules(
    client: AsyncClient,
) -> None:
    payload = {
        "name": "GatewayAgent",
        "role": "gateway",
        "system_prompt": "You are a gateway.",
        "channel_kind": "telegram",
        "channel_config": {"bot_token": "999:XYZ"},
        "skills": ["research", "writing"],
        "interaction_rules": {
            "output_format": "markdown",
            "tone": "formal",
            "response_language": "en",
            "forbidden_topics": ["spam"],
        },
    }
    resp = await client.post("/agents", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["channel_kind"] == "telegram"
    assert data["channel_config"]["bot_token"] == "999:XYZ"
    assert data["skills"] == ["research", "writing"]
    assert data["interaction_rules"]["output_format"] == "markdown"
    assert data["interaction_rules"]["forbidden_topics"] == ["spam"]

    # Cleanup
    await client.delete(f"/agents/{data['id']}")


async def test_update_agent_fields(client: AsyncClient) -> None:
    create_resp = await client.post(
        "/agents",
        json={**_BASE_AGENT, "name": "UpdateMe"},
    )
    assert create_resp.status_code == 201
    agent_id = create_resp.json()["id"]

    patch_resp = await client.patch(
        f"/agents/{agent_id}",
        json={
            "channel_kind": "telegram",
            "skills": ["analysis"],
            "interaction_rules": {"no_pii": True},
        },
    )
    assert patch_resp.status_code == 200
    updated = patch_resp.json()
    assert updated["channel_kind"] == "telegram"
    assert updated["skills"] == ["analysis"]
    assert updated["interaction_rules"]["no_pii"] is True

    # Cleanup
    await client.delete(f"/agents/{agent_id}")


async def test_delete_agent(client: AsyncClient) -> None:
    create_resp = await client.post(
        "/agents",
        json={**_BASE_AGENT, "name": "DeleteMe"},
    )
    assert create_resp.status_code == 201
    agent_id = create_resp.json()["id"]

    del_resp = await client.delete(f"/agents/{agent_id}")
    assert del_resp.status_code == 204

    get_resp = await client.get(f"/agents/{agent_id}")
    assert get_resp.status_code == 404
