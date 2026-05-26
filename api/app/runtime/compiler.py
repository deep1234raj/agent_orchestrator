"""Compiler — turn a workflow JSON document into an executable LangGraph.

Input: the `workflow.graph` JSON column. Expected shape:

  {
    "nodes": [
      {"id": "n1", "type": "start"},
      {"id": "n2", "type": "agent", "data": {"agent_id": "..."}},
      {"id": "n3", "type": "condition",
       "data": {"expr": "last_message contains 'approved'",
                "on_true":  "n5",
                "on_false": "n2"}},
      {"id": "n5", "type": "end"}
    ],
    "edges": [
      {"id": "e1", "source": "n1", "target": "n2"},
      {"id": "e2", "source": "n2", "target": "n3"}
      # Edges from a condition node are derived from its data, not edges[].
    ]
  }

Output: a compiled `langgraph.graph.StateGraph`.

Compilation is per-run by design (see docs/architecture.md). We always
read the latest agent rows from the DB so config edits take effect on
the next run with no restart.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from langgraph.graph import END, START, StateGraph
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.runtime.events import EventEmitter
from app.runtime.nodes import (
    AgentNode,
    make_expression_router,
    make_hint_router,
    terminal_node,
)
from app.runtime.state import RunState


class CompileError(Exception):
    """Raised when a workflow JSON is malformed or references missing data."""


@dataclass
class CompiledWorkflow:
    """The compiled graph plus the metadata the executor needs."""

    graph: Any                       # langgraph compiled graph
    agent_node_ids: list[str]        # for max_iterations bookkeeping


async def compile_workflow(
    *,
    graph_doc: dict[str, Any],
    session: AsyncSession,
    emitter: EventEmitter,
) -> CompiledWorkflow:
    """Compile a workflow JSON into an executable LangGraph."""
    nodes = graph_doc.get("nodes") or []
    edges = graph_doc.get("edges") or []
    if not nodes:
        raise CompileError("Workflow has no nodes.")

    nodes_by_id: dict[str, dict[str, Any]] = {n["id"]: n for n in nodes}

    # 1. Validate single start node.
    starts = [n for n in nodes if n["type"] == "start"]
    if len(starts) != 1:
        raise CompileError(f"Workflow must have exactly one start node, got {len(starts)}.")
    start_node = starts[0]

    # 2. Load every agent referenced, in one query.
    agent_ids = [
        uuid.UUID(n["data"]["agent_id"])
        for n in nodes
        if n["type"] == "agent" and n.get("data", {}).get("agent_id")
    ]
    agents_by_id: dict[uuid.UUID, Agent] = {}
    if agent_ids:
        result = await session.execute(select(Agent).where(Agent.id.in_(agent_ids)))
        for agent in result.scalars():
            agents_by_id[agent.id] = agent

        missing = set(agent_ids) - set(agents_by_id)
        if missing:
            raise CompileError(f"Referenced agents not found: {sorted(str(m) for m in missing)}")

    # 3. Build the StateGraph.
    sg: StateGraph = StateGraph(RunState)
    agent_node_ids: list[str] = []

    # Add a callable for every non-start, non-end node.
    for n in nodes:
        nid, ntype = n["id"], n["type"]
        if ntype == "agent":
            agent = agents_by_id[uuid.UUID(n["data"]["agent_id"])]
            sg.add_node(nid, AgentNode(agent=agent, emitter=emitter))
            agent_node_ids.append(nid)
        elif ntype == "end":
            sg.add_node(nid, terminal_node)
        elif ntype in ("start", "condition"):
            # `start` is mapped to LangGraph's START; conditions wire
            # via edges, not callables. Both handled below.
            pass
        else:
            raise CompileError(f"Unknown node type: {ntype!r}")

    # 4. Wire edges.
    # Plain edges (source -> target) from the edges list.
    # Conditional edges are derived from condition-node data and replace
    # any outbound edges the editor might have drawn from the condition.
    plain_edges: list[tuple[str, str]] = []
    for e in edges:
        src, dst = e["source"], e["target"]
        src_node = nodes_by_id.get(src)
        if src_node and src_node["type"] == "condition":
            continue  # handled via add_conditional_edges below
        plain_edges.append((src, dst))

    for src, dst in plain_edges:
        src_lg = START if src == start_node["id"] else src
        dst_lg = END if nodes_by_id.get(dst, {}).get("type") == "end" and dst not in [n["id"] for n in nodes if n["type"] == "end"] else dst
        # If dst is an end node, route to LangGraph's END.
        if nodes_by_id.get(dst, {}).get("type") == "end":
            # We still added the named end node above for graph clarity,
            # but we want execution to terminate after it. Route through
            # the named node first, then to END.
            sg.add_edge(src_lg, dst)
            sg.add_edge(dst, END)
        else:
            sg.add_edge(src_lg, dst)

    # Conditional edges from condition nodes.
    for n in nodes:
        if n["type"] != "condition":
            continue
        data = n.get("data", {})
        nid = n["id"]

        if "expr" in data:
            on_true = data["on_true"]
            on_false = data["on_false"]
            _validate_target(on_true, nodes_by_id)
            _validate_target(on_false, nodes_by_id)
            router = make_expression_router(
                expr=data["expr"], on_true=on_true, on_false=on_false
            )
            mapping = {on_true: _to_lg_target(on_true, nodes_by_id),
                       on_false: _to_lg_target(on_false, nodes_by_id)}
            sg.add_conditional_edges(nid, router, mapping)
        elif "routes" in data:
            routes = data["routes"]
            default = data["default"]
            for tgt in [*routes.values(), default]:
                _validate_target(tgt, nodes_by_id)
            router = make_hint_router(routes=routes, default=default)
            mapping = {tgt: _to_lg_target(tgt, nodes_by_id)
                       for tgt in {*routes.values(), default}}
            sg.add_conditional_edges(nid, router, mapping)
        else:
            raise CompileError(f"Condition node {nid!r} has no 'expr' or 'routes'.")

        # Make sure the condition node itself is reachable: the
        # add_node call requires a callable, even for pass-through.
        if nid not in sg.nodes:
            sg.add_node(nid, _passthrough)

    compiled = sg.compile()
    return CompiledWorkflow(graph=compiled, agent_node_ids=agent_node_ids)


# ─── helpers ─────────────────────────────────────────────────────────────────


async def _passthrough(state: RunState) -> dict[str, Any]:
    """Identity node for condition vertices that need to be in the graph."""
    return {}


def _validate_target(target: str, nodes_by_id: dict[str, dict[str, Any]]) -> None:
    if target not in nodes_by_id:
        raise CompileError(f"Edge target {target!r} does not exist in the workflow.")


def _to_lg_target(target: str, nodes_by_id: dict[str, dict[str, Any]]) -> str:
    """Translate a workflow node id to a LangGraph target.

    End nodes map to LangGraph's END sentinel; everything else keeps its id.
    """
    if nodes_by_id.get(target, {}).get("type") == "end":
        return END
    return target
