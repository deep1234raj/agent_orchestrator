"""calculator — evaluate a math expression safely.

Uses Python's `ast` module to evaluate only arithmetic — no name lookups,
no function calls, no attribute access. Safe to expose to an LLM.
"""
from __future__ import annotations

import ast
import operator
from typing import Any

from app.tools.registry import tool


_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.Mod: operator.mod,
    ast.FloorDiv: operator.floordiv,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


def _eval(node: ast.AST) -> float:
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return float(node.value)
        raise ValueError(f"Unsupported constant: {node.value!r}")
    if isinstance(node, ast.BinOp):
        op = _OPS.get(type(node.op))
        if op is None:
            raise ValueError(f"Unsupported operator: {type(node.op).__name__}")
        return op(_eval(node.left), _eval(node.right))
    if isinstance(node, ast.UnaryOp):
        op = _OPS.get(type(node.op))
        if op is None:
            raise ValueError(f"Unsupported unary operator: {type(node.op).__name__}")
        return op(_eval(node.operand))
    raise ValueError(f"Unsupported AST node: {type(node).__name__}")


@tool(description="Evaluate a basic arithmetic expression like '2 * (3 + 4)'.")
async def calculator(expression: str) -> dict[str, Any]:
    """Returns {result: float, error: str|None}."""
    try:
        tree = ast.parse(expression, mode="eval")
        value = _eval(tree.body)
        return {"result": value, "error": None}
    except Exception as e:  # noqa: BLE001
        return {"result": None, "error": f"calculator failed: {e}"}
