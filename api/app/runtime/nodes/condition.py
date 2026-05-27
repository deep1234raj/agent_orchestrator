"""Condition node.

A condition node doesn't update state itself. It exists so the compiler
can attach `add_conditional_edges` to the node — the evaluator function
inspects state and picks the next node name.

We keep two forms of condition:

  expr      A small DSL: `last_message contains "approved"` etc.
            Restricted to a handful of operators so it's safe to evaluate
            without giving the LLM a foot-gun.
  hint      Read `state.next_hint`, which a preceding agent may have set
            via a structured output. The condition just routes on the
            hint value.

The compiler decides which form to use based on the node's `data` payload.
"""

from __future__ import annotations

import re
from collections.abc import Callable

from app.runtime.state import RunState

# ─── Expression evaluator ────────────────────────────────────────────────────

# Each expression is `<source> <op> <literal>` with a fixed vocabulary.
# Source: "last_message" | "iterations"
# Op:     "contains" | "==" | "!=" | ">" | "<" | ">=" | "<="
# Literal: a quoted string or a bare integer.
_EXPR_RE = re.compile(
    r"""^\s*
        (?P<src>last_message|iterations)
        \s+
        (?P<op>contains|==|!=|>=|<=|>|<)
        \s+
        (?P<lit>"[^"]*"|'[^']*'|-?\d+)
        \s*$""",
    re.VERBOSE,
)


def _resolve_source(state: RunState, src: str) -> str | int:
    if src == "iterations":
        return state.iterations
    if src == "last_message":
        return state.messages[-1].content if state.messages else ""
    raise ValueError(f"Unknown condition source: {src!r}")


def _parse_literal(lit: str) -> str | int:
    if lit.startswith(("'", '"')):
        return lit[1:-1]
    return int(lit)


def _evaluate(expr: str, state: RunState) -> bool:
    m = _EXPR_RE.match(expr)
    if not m:
        raise ValueError(f"Invalid condition expression: {expr!r}")
    src = _resolve_source(state, m.group("src"))
    lit = _parse_literal(m.group("lit"))
    op = m.group("op")

    if op == "contains":
        return str(lit).lower() in str(src).lower()
    if op == "==":
        return src == lit
    if op == "!=":
        return src != lit
    if op == ">":
        return src > lit  # type: ignore[operator]
    if op == "<":
        return src < lit  # type: ignore[operator]
    if op == ">=":
        return src >= lit  # type: ignore[operator]
    if op == "<=":
        return src <= lit  # type: ignore[operator]
    raise ValueError(f"Unhandled operator: {op!r}")


def make_expression_router(*, expr: str, on_true: str, on_false: str) -> Callable[[RunState], str]:
    """Build a router function for `add_conditional_edges`."""

    def router(state: RunState) -> str:
        return on_true if _evaluate(expr, state) else on_false

    return router


def make_hint_router(*, routes: dict[str, str], default: str) -> Callable[[RunState], str]:
    """Route on `state.next_hint`. Falls back to `default` if no hint set."""

    def router(state: RunState) -> str:
        if state.next_hint and state.next_hint in routes:
            return routes[state.next_hint]
        return default

    return router
