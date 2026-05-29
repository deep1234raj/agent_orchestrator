"""Template seeder.

Reads every JSON file in app/runtime/templates/ at startup and creates:
  - the referenced agents (if no agent by that name exists), and
  - the workflow itself (if no workflow by that name exists).

Idempotent: if anything by the same name already exists, we skip it.
The user may have edited templates after the first boot and we never
want to silently clobber their edits.

Template schema (one JSON file per workflow):
  {
    "name":        "Display name",
    "description": "What this does",
    "agents":      [<AgentCreate-shape>, ...],   # agents referenced by name
    "graph":       {                              # React Flow document
       "nodes": [
         {"id": "...", "type": "agent",
          "data": {"agent": "<agent-name>"}},    # resolved at seed time
         ...
       ],
       "edges": [...]
    }
  }

The seeder resolves `data.agent` (a name) into `data.agent_id` (a UUID)
before persisting the workflow, so the compiler — which expects UUIDs —
sees a normal workflow document with no template-specific knowledge.
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import session_scope
from app.models.agent import Agent
from app.models.enums import MemoryMode
from app.models.workflow import Workflow

log = structlog.get_logger(__name__)


TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "runtime" / "templates"


async def seed_templates() -> None:
    """Read every JSON in TEMPLATES_DIR and seed it (idempotently)."""
    if not TEMPLATES_DIR.exists():
        log.info("templates_dir_missing", path=str(TEMPLATES_DIR))
        return

    files = sorted(TEMPLATES_DIR.glob("*.json"))
    if not files:
        log.info("no_templates_found")
        return

    async with session_scope() as s:
        for path in files:
            try:
                await _seed_one(s, path)
            except Exception:
                log.exception("template_seed_failed", file=path.name)


async def _seed_one(s: AsyncSession, path: Path) -> None:
    doc = json.loads(path.read_text())
    name = doc["name"]
    description = doc.get("description", "")
    agents_data: list[dict[str, Any]] = doc.get("agents", [])
    graph: dict[str, Any] = doc["graph"]

    # 1. Seed agents. Build a name -> id map for graph rewriting.
    agent_id_by_name: dict[str, uuid.UUID] = {}
    for agent_data in agents_data:
        agent_id = await _upsert_agent_by_name(s, agent_data)
        agent_id_by_name[agent_data["name"]] = agent_id

    # Build node_id -> agent_name from the template graph (pre-rewrite).
    # Used below to patch stale agent_ids in existing workflows.
    template_node_agent: dict[str, str] = {
        n["id"]: n["data"]["agent"]
        for n in graph.get("nodes", [])
        if n.get("type") == "agent" and n.get("data", {}).get("agent")
    }

    # 2. Check if the workflow already exists.
    existing_result = await s.execute(select(Workflow).where(Workflow.name == name))
    existing = existing_result.scalar_one_or_none()

    if existing is not None:
        # Patch stale agent_ids without touching graph topology, positions,
        # or any user-edited nodes. A node is stale when its agent_id is not
        # among the currently-live agent IDs produced above.
        live_ids = {str(v) for v in agent_id_by_name.values()}
        existing_graph: dict[str, Any] = dict(existing.graph or {})
        patched_nodes = []
        updated = False
        for node in existing_graph.get("nodes", []):
            if node.get("type") == "agent":
                data = dict(node.get("data", {}))
                if data.get("agent_id") not in live_ids:
                    agent_name = template_node_agent.get(node["id"])
                    if agent_name and agent_name in agent_id_by_name:
                        data["agent_id"] = str(agent_id_by_name[agent_name])
                        node = {**node, "data": data}
                        updated = True
                        log.info("agent_id_refreshed", node_id=node["id"], agent=agent_name)
            patched_nodes.append(node)

        if updated:
            # Assign a new dict so SQLAlchemy detects the JSON column change.
            existing.graph = {**existing_graph, "nodes": patched_nodes}
            log.info("workflow_agent_ids_refreshed", name=name)
        else:
            log.info("workflow_already_exists", name=name)
        return

    # 3. Rewrite the template graph: every agent node referencing a name
    #    gets the resolved UUID. Seed the workflow.
    rewritten = _rewrite_graph(graph, agent_id_by_name)
    s.add(
        Workflow(
            name=name,
            description=description,
            graph=rewritten,
            is_template=True,
        )
    )
    log.info("workflow_seeded", name=name)


async def _upsert_agent_by_name(s: AsyncSession, data: dict[str, Any]) -> uuid.UUID:
    """Return the id of an agent with this name. Creates it if missing."""
    name = data["name"]
    result = await s.execute(select(Agent).where(Agent.name == name))
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing.id

    # Translate the memory_mode string into the enum.
    memory_mode = MemoryMode(data.get("memory_mode", "summary"))

    agent = Agent(
        name=name,
        role=data["role"],
        system_prompt=data["system_prompt"],
        provider=data.get("provider", "anthropic"),
        model=data.get("model", "claude-sonnet-4-5"),
        temperature=float(data.get("temperature", 0.7)),
        max_tokens=int(data.get("max_tokens", 2048)),
        tools=list(data.get("tools", [])),
        memory_mode=memory_mode,
        memory_window=int(data.get("memory_window", 10)),
        guardrails=dict(data.get("guardrails", {})),
    )
    s.add(agent)
    await s.flush()
    log.info("agent_seeded", name=name, id=str(agent.id))
    return agent.id


def _rewrite_graph(graph: dict[str, Any], agent_id_by_name: dict[str, uuid.UUID]) -> dict[str, Any]:
    """Replace `data.agent` (name) with `data.agent_id` (UUID string) on each agent node."""
    nodes = []
    for n in graph.get("nodes", []):
        if n.get("type") == "agent":
            data = dict(n.get("data", {}))
            agent_name = data.pop("agent", None)
            if agent_name and agent_name in agent_id_by_name:
                data["agent_id"] = str(agent_id_by_name[agent_name])
            nodes.append({**n, "data": data})
        else:
            nodes.append(n)
    return {**graph, "nodes": nodes}
