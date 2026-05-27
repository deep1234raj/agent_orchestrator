"""LLM provider abstraction.

Each agent specifies a provider (anthropic | openai) and model. The
runtime calls `invoke()` with the prepared message list and the tool
schemas; the provider implementation handles the SDK details and
returns a normalized `LLMResponse`.

Why not just use LangChain's ChatModel?
  - We want exact control over the tool-use loop (so we can record each
    tool_call to the DB and emit events between calls).
  - We want exact token-count attribution (LangChain hides it behind
    callbacks that are awkward to thread through async code).
  - The interface here is small. Wrapping it ourselves is cheaper than
    untangling LangChain abstractions when something goes wrong.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Literal


@dataclass
class ToolUseRequest:
    """The LLM asked us to invoke a tool."""

    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class LLMResponse:
    """Normalized response across providers."""

    # The model's text reply, if any. Empty string when the model only
    # requested tool calls in this turn.
    text: str = ""

    # Tool calls the model wants executed before continuing.
    tool_uses: list[ToolUseRequest] = field(default_factory=list)

    # Usage counters. Always populated; defaults are 0 when unavailable.
    input_tokens: int = 0
    output_tokens: int = 0

    # Reason the model stopped: "end_turn" | "tool_use" | "max_tokens" | "stop"
    stop_reason: Literal["end_turn", "tool_use", "max_tokens", "stop"] = "end_turn"


@dataclass
class ToolResult:
    """Result of executing a tool, fed back to the model next turn."""

    tool_use_id: str
    content: str  # serialized result for the model
    is_error: bool = False


class LLMProvider:
    """Interface every provider implements."""

    async def invoke(
        self,
        *,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        temperature: float,
        max_tokens: int,
    ) -> LLMResponse:
        raise NotImplementedError

    def format_user(self, content: str) -> dict[str, Any]:
        """How a user-role message should look in this provider's payload."""
        raise NotImplementedError

    def format_assistant(self, text: str, tool_uses: list[ToolUseRequest]) -> dict[str, Any]:
        """How a prior assistant turn should look when replayed."""
        raise NotImplementedError

    def format_tool_results(self, results: list[ToolResult]) -> dict[str, Any]:
        """How tool results are sent back to the model."""
        raise NotImplementedError


# ─────────────────────────────────────────────────────────────────────────────
# Anthropic
# ─────────────────────────────────────────────────────────────────────────────


class AnthropicProvider(LLMProvider):
    def __init__(self) -> None:
        from anthropic import AsyncAnthropic  # local import to keep startup light

        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not configured.")
        self._client = AsyncAnthropic(api_key=api_key)

    async def invoke(
        self,
        *,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        temperature: float,
        max_tokens: int,
    ) -> LLMResponse:
        kwargs: dict[str, Any] = {
            "model": model,
            "system": system,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if tools:
            kwargs["tools"] = tools

        resp = await self._client.messages.create(**kwargs)

        text_parts: list[str] = []
        tool_uses: list[ToolUseRequest] = []
        for block in resp.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_uses.append(
                    ToolUseRequest(
                        id=block.id,
                        name=block.name,
                        arguments=dict(block.input),
                    )
                )

        stop_map = {
            "end_turn": "end_turn",
            "tool_use": "tool_use",
            "max_tokens": "max_tokens",
            "stop_sequence": "stop",
        }
        stop_reason = stop_map.get(resp.stop_reason or "end_turn", "end_turn")

        return LLMResponse(
            text="".join(text_parts),
            tool_uses=tool_uses,
            input_tokens=resp.usage.input_tokens,
            output_tokens=resp.usage.output_tokens,
            stop_reason=stop_reason,  # type: ignore[arg-type]
        )

    def format_user(self, content: str) -> dict[str, Any]:
        return {"role": "user", "content": content}

    def format_assistant(self, text: str, tool_uses: list[ToolUseRequest]) -> dict[str, Any]:
        blocks: list[dict[str, Any]] = []
        if text:
            blocks.append({"type": "text", "text": text})
        for tu in tool_uses:
            blocks.append(
                {
                    "type": "tool_use",
                    "id": tu.id,
                    "name": tu.name,
                    "input": tu.arguments,
                }
            )
        return {"role": "assistant", "content": blocks}

    def format_tool_results(self, results: list[ToolResult]) -> dict[str, Any]:
        return {
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": r.tool_use_id,
                    "content": r.content,
                    "is_error": r.is_error,
                }
                for r in results
            ],
        }


# ─────────────────────────────────────────────────────────────────────────────
# Provider lookup
# ─────────────────────────────────────────────────────────────────────────────


_providers: dict[str, LLMProvider] = {}


def get_provider(name: str) -> LLMProvider:
    """Return a cached provider instance, constructing on first use."""
    if name not in _providers:
        if name == "anthropic":
            _providers[name] = AnthropicProvider()
        # OpenAI provider is stubbed; the interface is in place but the
        # implementation lives behind a TODO until needed for the demo.
        else:
            raise ValueError(f"Unsupported LLM provider: {name!r}")
    return _providers[name]
