"""AgentNode — the LLM-invocation node with tool calling.

One AgentNode per agent in a workflow. Each invocation:

  1. Selects which past messages to include (memory strategy).
  2. Calls the LLM with the agent's tools attached.
  3. If the model requests tool calls, executes them, records each one,
     feeds results back, and loops.
  4. Persists the final text reply as a message.
  5. Emits usage events for cost tracking.

The loop terminates when the model returns text without requesting more
tools, or when the agent's per-invocation iteration budget is exhausted.

A node returns a state patch: new messages get appended to RunState.messages
via the reducer. `iterations` is incremented so the executor can enforce
the workflow-level guardrail.
"""
from __future__ import annotations

import json
import time
import uuid
from typing import Any

import structlog

from app.models.agent import Agent
from app.models.enums import MessageRole
from app.runtime.events import EventEmitter
from app.runtime.llm import LLMProvider, ToolResult, ToolUseRequest, get_provider
from app.runtime.memory import select_memory
from app.runtime.state import RunState, StateMessage
from app.tools.registry import get_tool

log = structlog.get_logger(__name__)


# Cap on tool-call iterations *within a single agent turn*. The
# workflow-level max_iterations guardrail counts agent turns, not these.
# 8 is generous for a reasonable tool-using agent; if it loops more than
# that, something is wrong.
MAX_TOOL_LOOPS_PER_TURN = 8


class AgentNode:
    """Callable that LangGraph invokes with a RunState."""

    def __init__(self, agent: Agent, emitter: EventEmitter) -> None:
        self.agent = agent
        self.emitter = emitter
        self.provider: LLMProvider = get_provider(agent.provider)

    async def __call__(self, state: RunState) -> dict[str, Any]:
        log.info("agent_node_start", agent=self.agent.name, run_id=str(state.run_id))
        await self.emitter.agent_started(self.agent.id, self.agent.name)

        # 1. Pick the slice of history this agent sees.
        memory = select_memory(
            mode=self.agent.memory_mode,
            window=self.agent.memory_window,
            history=state.messages,
        )

        # 2. Translate to provider format.
        provider_messages = [_state_msg_to_provider(self.provider, m) for m in memory]

        # If memory is empty but there's input, seed it as the user turn.
        if not provider_messages and state.input.get("input"):
            provider_messages.append(self.provider.format_user(str(state.input["input"])))

        # 3. Resolve tool schemas.
        tool_specs = [get_tool(t) for t in self.agent.tools]
        tool_schemas = [t.schema() for t in tool_specs]

        # 4. The tool-use loop.
        produced_messages: list[StateMessage] = []
        final_text = ""

        for loop_idx in range(MAX_TOOL_LOOPS_PER_TURN):
            response = await self.provider.invoke(
                model=self.agent.model,
                system=self.agent.system_prompt,
                messages=provider_messages,
                tools=tool_schemas,
                temperature=self.agent.temperature,
                max_tokens=self.agent.max_tokens,
            )

            # Record usage for every LLM call, even mid-loop ones.
            await self.emitter.usage(
                agent_id=self.agent.id,
                provider=self.agent.provider,
                model=self.agent.model,
                input_tokens=response.input_tokens,
                output_tokens=response.output_tokens,
            )

            # If the model has no tool calls, this is its final turn.
            if not response.tool_uses:
                final_text = response.text
                break

            # Otherwise, record this assistant turn (text + tool requests),
            # execute every requested tool, and feed results back.
            provider_messages.append(
                self.provider.format_assistant(response.text, response.tool_uses)
            )
            tool_results = await self._execute_tool_uses(response.tool_uses)
            provider_messages.append(self.provider.format_tool_results(tool_results))
        else:
            # Loop exhausted without a final text response. Synthesize a
            # short notice so the workflow has something to record.
            final_text = (
                f"[{self.agent.name} reached its tool-call loop budget without "
                f"producing a final response.]"
            )
            log.warning(
                "agent_tool_loop_exhausted",
                agent=self.agent.name,
                run_id=str(state.run_id),
            )

        # 5. Persist + broadcast the agent's final reply.
        await self.emitter.message(
            role=MessageRole.AGENT,
            content=final_text,
            agent_id=self.agent.id,
            agent_name=self.agent.name,
        )

        produced_messages.append(
            StateMessage(
                role="agent",
                content=final_text,
                agent_id=self.agent.id,
                agent_name=self.agent.name,
            )
        )

        await self.emitter.agent_finished(self.agent.id, self.agent.name)
        log.info("agent_node_done", agent=self.agent.name, run_id=str(state.run_id))

        # LangGraph state patch: messages get merged via the reducer,
        # iterations increments by 1 for this agent turn.
        return {
            "messages": produced_messages,
            "iterations": state.iterations + 1,
        }

    async def _execute_tool_uses(
        self, tool_uses: list[ToolUseRequest]
    ) -> list[ToolResult]:
        """Run each tool call, recording results to DB and broadcasting events."""
        results: list[ToolResult] = []
        for tu in tool_uses:
            tc_id = await self.emitter.tool_call_start(
                agent_id=self.agent.id,
                tool_name=tu.name,
                arguments=tu.arguments,
            )
            t0 = time.perf_counter()
            try:
                spec = get_tool(tu.name)
                raw = await spec.invoke(tu.arguments)
                duration_ms = (time.perf_counter() - t0) * 1000
                await self.emitter.tool_call_finish(
                    tc_id,
                    result=_jsonify(raw),
                    duration_ms=duration_ms,
                )
                results.append(
                    ToolResult(
                        tool_use_id=tu.id,
                        content=json.dumps(_jsonify(raw)),
                        is_error=False,
                    )
                )
            except Exception as e:  # noqa: BLE001
                duration_ms = (time.perf_counter() - t0) * 1000
                err_msg = f"{type(e).__name__}: {e}"
                await self.emitter.tool_call_finish(
                    tc_id, error=err_msg, duration_ms=duration_ms
                )
                results.append(
                    ToolResult(
                        tool_use_id=tu.id,
                        content=err_msg,
                        is_error=True,
                    )
                )
        return results


def _state_msg_to_provider(provider: LLMProvider, m: StateMessage) -> dict[str, Any]:
    """Render a StateMessage into the provider's message dict.

    Agent and system messages become user-role context in the provider
    payload, prefixed with `[name]:` so the new LLM call can distinguish
    them. This keeps the message log simple and avoids forcing one agent
    to "play assistant" in another agent's call.
    """
    if m.role == "user":
        return provider.format_user(m.content)
    label = m.agent_name or m.role
    return provider.format_user(f"[{label}]: {m.content}")


def _jsonify(value: Any) -> dict[str, Any]:
    """Coerce a tool's return value into a JSON-serializable dict."""
    if isinstance(value, dict):
        return value
    return {"value": value}
