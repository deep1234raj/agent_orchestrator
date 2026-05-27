"""send_message — dispatch a message to the channel that triggered this run.

When a workflow is triggered by Telegram, the webhook seeds
`run.input` with `{"channel": "telegram", "chat_id": "..."}`. This tool
reads those values and dispatches through the registered channel adapter.

The tool depends on having access to the run's input. Since tools are
plain functions, we expose the input via a contextvar that the executor
sets before invoking nodes. This keeps the tool signature clean (the
LLM sees a simple `text` parameter) while letting the tool reach the
routing context it needs.

If the run wasn't triggered by an external channel (e.g. UI-triggered),
the tool returns a structured error — the agent can recover by simply
ending its turn without sending.
"""
from __future__ import annotations

from contextvars import ContextVar
from typing import Any

import structlog

from app.channels.base import ChannelMessage, dispatch_send, get_channel_or_none
from app.models.enums import ChannelKind
from app.tools.registry import tool

log = structlog.get_logger(__name__)


# Set by the executor at the start of each run, read by send_message.
# A contextvar (not a global) so concurrent runs don't trample each other.
_run_input: ContextVar[dict[str, Any]] = ContextVar("_run_input", default={})


def set_run_input_context(input_: dict[str, Any]) -> None:
    """Called by the executor at run start. Module-private API."""
    _run_input.set(input_)


@tool(
    description=(
        "Send a text message back to the user through the external channel "
        "(Telegram, etc.) that started this conversation. Use this at the "
        "end of a workflow when you have a final answer to deliver. "
        "Returns {ok: bool, error: str|None}."
    )
)
async def send_message(text: str) -> dict[str, Any]:
    """Send `text` to the user via the triggering channel."""
    inp = _run_input.get()
    channel_name = inp.get("channel")
    chat_id = inp.get("chat_id")

    if not channel_name or not chat_id:
        return {
            "ok": False,
            "error": (
                "This run wasn't triggered by an external channel "
                "(no 'channel' or 'chat_id' in input). Nothing to send to."
            ),
        }

    try:
        kind = ChannelKind(channel_name)
    except ValueError:
        return {"ok": False, "error": f"unknown channel: {channel_name!r}"}

    if get_channel_or_none(kind) is None:
        return {
            "ok": False,
            "error": f"channel {channel_name!r} is not configured on the server.",
        }

    try:
        await dispatch_send(kind, ChannelMessage(chat_id=str(chat_id), text=text))
    except Exception as e:  # noqa: BLE001
        log.exception("send_message_failed", channel=channel_name, chat_id=chat_id)
        return {"ok": False, "error": f"send failed: {e}"}

    return {"ok": True, "error": None}
