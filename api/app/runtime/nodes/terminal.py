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
      2. The last *substantive* agent message (> 20 chars) under "reply".
         Short messages like "approved" are coordination signals, not
         the intended output — scan backwards past them.
      3. Empty dict.
    """
    if "output" in state.context:
        return {"output": state.context["output"]}
    for msg in reversed(state.messages):
        if msg.role == "agent" and len(msg.content.strip()) > 20:
            return {"reply": msg.content, "agent": msg.agent_name}
    return {}
