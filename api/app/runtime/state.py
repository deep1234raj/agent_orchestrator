"""RunState — the state object threaded through every LangGraph node.

LangGraph nodes receive a state, may mutate parts of it, and return a
patch. We use a TypedDict-style Pydantic model with `add_messages`-like
behavior on the message log so updates accumulate rather than replace.

Keep this model minimal. Anything node-specific goes in `context` rather
than as a top-level field — it keeps the schema stable as we add nodes.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field


class StateMessage(BaseModel):
    """A message as it appears in the in-flight state.

    This is the runtime shape; it's mirrored to a `messages` table row
    when persisted. Kept separate from the ORM model so the runtime
    never depends on SQLAlchemy.
    """

    role: Literal["user", "agent", "system", "tool"]
    content: str
    agent_id: uuid.UUID | None = None
    agent_name: str | None = None
    meta: dict[str, Any] = Field(default_factory=dict)


def _append_messages(left: list[StateMessage], right: list[StateMessage]) -> list[StateMessage]:
    """Reducer: concatenate message lists. Used by LangGraph's state merger."""
    return left + right


class RunState(BaseModel):
    """State threaded through every node in a workflow run.

    Fields:
      run_id:      identifies which run this state belongs to (for events).
      input:       the initial input handed to the run (e.g. a Telegram message).
      messages:    append-only log of everything said during this run.
      context:     free-form scratch space for node-to-node hand-offs.
      next_hint:   optional hint from a node to the router. Conditional
                   edges may consult this when deciding where to go next.
      iterations:  number of agent invocations so far. The executor uses
                   this against the per-run max-iteration guardrail.
    """

    run_id: uuid.UUID
    input: dict[str, Any] = Field(default_factory=dict)

    # Annotated with the reducer so LangGraph merges, not overwrites.
    messages: Annotated[list[StateMessage], _append_messages] = Field(default_factory=list)

    context: dict[str, Any] = Field(default_factory=dict)
    next_hint: str | None = None
    iterations: int = 0

    model_config = {"arbitrary_types_allowed": True}
