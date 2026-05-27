"""Tool registry.

Tools are async functions decorated with `@tool`. The decorator captures
the name, description, and a JSON schema for parameters (derived from
type hints + Pydantic) and registers the function in a process-wide map.

The agent node uses the registry two ways:
  1. To enumerate tool schemas to hand to the LLM for function calling.
  2. To look up a tool by name and invoke it with parsed arguments.

The UI uses the registry to populate the "tools" multi-select on the
agent configuration form.
"""

from __future__ import annotations

import inspect
from collections.abc import Awaitable, Callable
from typing import Any, get_type_hints

from pydantic import BaseModel, Field, create_model

# Module-private registry. Populated at import time by @tool decorators.
_REGISTRY: dict[str, ToolSpec] = {}


class ToolSpec:
    """Wrapped tool: function + JSON schema + description."""

    def __init__(
        self,
        name: str,
        description: str,
        func: Callable[..., Awaitable[Any]],
        schema_model: type[BaseModel],
    ) -> None:
        self.name = name
        self.description = description
        self.func = func
        self.schema_model = schema_model

    def schema(self) -> dict[str, Any]:
        """JSON schema in the shape expected by Anthropic/OpenAI tool APIs."""
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.schema_model.model_json_schema(),
        }

    async def invoke(self, arguments: dict[str, Any]) -> Any:
        """Validate arguments against schema, then call the function."""
        validated = self.schema_model(**arguments)
        return await self.func(**validated.model_dump())


def tool(
    *,
    name: str | None = None,
    description: str,
) -> Callable[[Callable[..., Awaitable[Any]]], Callable[..., Awaitable[Any]]]:
    """Decorator that registers an async function as a tool.

    Parameters become the tool's input schema. Every parameter must have
    a type annotation; defaults are honored.

    Example:
        @tool(description="Add two numbers.")
        async def calculator(a: float, b: float) -> float:
            return a + b
    """

    def decorator(func: Callable[..., Awaitable[Any]]) -> Callable[..., Awaitable[Any]]:
        if not inspect.iscoroutinefunction(func):
            raise TypeError(f"Tool {func.__name__} must be async.")

        tool_name = name or func.__name__
        if tool_name in _REGISTRY:
            raise ValueError(f"Tool {tool_name!r} is already registered.")

        # Build a Pydantic model from the function signature for arg validation.
        hints = get_type_hints(func)
        hints.pop("return", None)
        sig = inspect.signature(func)
        fields: dict[str, Any] = {}
        for param_name, param in sig.parameters.items():
            annotation = hints.get(param_name, Any)
            default = ... if param.default is inspect.Parameter.empty else param.default
            fields[param_name] = (annotation, Field(default=default))

        schema_model = create_model(  # type: ignore[call-overload]
            f"{tool_name.title().replace('_', '')}Args",
            **fields,
        )

        _REGISTRY[tool_name] = ToolSpec(
            name=tool_name,
            description=description,
            func=func,
            schema_model=schema_model,
        )
        return func

    return decorator


def get_tool(name: str) -> ToolSpec:
    """Look up a tool by name. Raises KeyError if not registered."""
    if name not in _REGISTRY:
        raise KeyError(f"Tool {name!r} is not registered.")
    return _REGISTRY[name]


def list_tools() -> list[ToolSpec]:
    """Return every registered tool (used by the UI dropdown)."""
    return list(_REGISTRY.values())


def import_all_tools() -> None:
    """Import all tool modules so their decorators run.

    Called once at app startup. Add a line here for every new tool module
    you create — relying on globbing is too magical for this codebase.
    """
    from app.tools import (  # noqa: F401
        calculator,
        get_time,
        http_get,
        load_skill,
        send_message,
        web_search,
    )
