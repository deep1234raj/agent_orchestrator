"""Terminal node — produces the final `run.output`.

The end node reads the last agent message and packages it as the run's
output. Workflows that need a richer final shape (e.g. structured JSON)
can add a node before this one to populate `state.context["output"]`,
which we'll prefer when present.
"""
from __future__ import annotations

from typing import Any

from app.runtime.state import RunState


async def terminal_node(state: RunState) -> dict[str, Any]:
    """Return a patch that doesn't change state.

    The executor reads the final state after the graph completes and
    derives `run.output` from it; this node mostly exists so the graph
    has a named end point matching the React Flow document's "end" node.
    """
    return {}


def derive_output(state: RunState) -> dict[str, Any]:
    """Pick the final output shape from terminal state.

    Precedence:
      1. state.context["output"] if explicitly populated.
      2. The last agent message's content under "reply".
      3. Empty dict.
    """
    if "output" in state.context:
        return {"output": state.context["output"]}
    if state.messages:
        last = state.messages[-1]
        return {"reply": last.content, "agent": last.agent_name}
    return {}
