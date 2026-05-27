"""Memory strategies.

Memory in this system means: given the full message log of a run, what
subset (or summary of it) do we feed back to an agent on its next turn?

Three modes, mirroring the MemoryMode enum:

  NONE:     send nothing prior — agent is stateless within the run.
  WINDOWED: send the last N messages verbatim.
  SUMMARY:  send a rolling summary plus the last few messages verbatim.

These are deliberately simple. Vector-backed long-term memory is the
obvious upgrade path (see docs/architecture.md "out of scope").
"""

from __future__ import annotations

from app.models.enums import MemoryMode
from app.runtime.state import StateMessage


def select_memory(
    *,
    mode: MemoryMode,
    window: int,
    history: list[StateMessage],
) -> list[StateMessage]:
    """Pick the messages an agent should see based on its memory config.

    Returns a new list — never mutates the input.
    """
    if mode == MemoryMode.NONE:
        return []
    if mode == MemoryMode.WINDOWED:
        return history[-window:] if window > 0 else []
    if mode == MemoryMode.SUMMARY:
        # If history is short, just return it. Otherwise return a synthesized
        # summary message plus the tail.
        if len(history) <= window:
            return list(history)
        tail = history[-window:]
        head = history[:-window]
        summary = _summarize(head)
        return [
            StateMessage(role="system", content=f"[Summary of earlier messages]\n{summary}"),
            *tail,
        ]
    raise ValueError(f"Unsupported memory mode: {mode}")


def _summarize(messages: list[StateMessage]) -> str:
    """Cheap, deterministic summary: who said what, condensed.

    Doing an LLM-based summary here would be more useful but would mean
    every agent turn potentially triggers an extra LLM call. For the
    demo, deterministic concatenation is enough. An LLM-summarizer is a
    one-file swap when needed.
    """
    lines = []
    for m in messages:
        who = m.agent_name or m.role
        snippet = m.content.strip().replace("\n", " ")
        if len(snippet) > 200:
            snippet = snippet[:200] + "…"
        lines.append(f"- {who}: {snippet}")
    return "\n".join(lines)
