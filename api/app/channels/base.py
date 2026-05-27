"""Channel base protocol.

A `Channel` is an adapter to an external messaging system (Telegram,
Slack, WhatsApp, …). The runtime knows nothing about specific
providers — it just calls `dispatch_send()` with a normalized
ChannelMessage and the registered channel for that kind does the work.

Implementations register themselves via `register_channel()`. There's
one instance per kind, constructed lazily from environment config.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.models.enums import ChannelKind


@dataclass
class ChannelMessage:
    """A normalized message flowing in either direction.

    For inbound: produced by a webhook handler.
    For outbound: produced by the `send_message` tool.
    """

    chat_id: str          # provider-side conversation identifier
    text: str             # the message body
    sender_id: str | None = None     # who sent it (inbound only)
    sender_name: str | None = None   # display name (inbound only)


class Channel(Protocol):
    """The interface every channel adapter implements."""

    kind: ChannelKind

    async def send(self, message: ChannelMessage) -> None:
        """Deliver a message to the external system."""
        ...

    def verify_webhook(self, headers: dict[str, str]) -> bool:
        """Return True if the inbound webhook is authentic.

        For systems without verification (or where it's optional in
        development), return True.
        """
        ...


# ─────────────────────────────────────────────────────────────────────────────
# Registry
# ─────────────────────────────────────────────────────────────────────────────

_registry: dict[ChannelKind, Channel] = {}


def register_channel(channel: Channel) -> None:
    """Register a channel adapter. Idempotent — later registration wins."""
    _registry[channel.kind] = channel


def get_channel(kind: ChannelKind) -> Channel:
    """Look up a registered channel. Raises if not registered."""
    if kind not in _registry:
        raise KeyError(
            f"No channel registered for kind {kind.value!r}. "
            f"Did you set the required env vars at startup?"
        )
    return _registry[kind]


def get_channel_or_none(kind: ChannelKind) -> Channel | None:
    """Look up a channel, returning None if unregistered."""
    return _registry.get(kind)


async def dispatch_send(kind: ChannelKind, message: ChannelMessage) -> None:
    """Send a message via the registered channel of this kind."""
    channel = get_channel(kind)
    await channel.send(message)
