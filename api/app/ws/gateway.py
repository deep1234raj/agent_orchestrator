"""WebSocket gateway.

One route: `/ws/runs/{run_id}`. Clients connect to receive a live event
stream for one specific run. We replay nothing on connect — the run
detail endpoint already serves history, and the WS is for *what happens
next*. This keeps the gateway tiny and avoids race-y replay semantics.

Lifecycle:
  1. Client connects, we accept and call `subscribe(run_id)` to get an
     asyncio.Queue that the runtime publishes into.
  2. We loop: pull an event off the queue, serialize, send.
  3. On disconnect (or any send failure), unsubscribe and exit.

If the runtime never publishes for this run (because the run finished
before the client connected), the client just sits there. That's
correct — they should use the REST endpoint to detect terminal status.
The UI does both: opens the WS *and* polls the run row once on mount.
"""

from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.runtime.events import subscribe, unsubscribe

log = structlog.get_logger(__name__)

router = APIRouter(tags=["ws"])


@router.websocket("/ws/runs/{run_id}")
async def run_events(ws: WebSocket, run_id: uuid.UUID) -> None:
    await ws.accept()
    log.info("ws_connect", run_id=str(run_id))

    queue = await subscribe(run_id)
    try:
        while True:
            event = await queue.get()
            await ws.send_json(
                {
                    "run_id": str(event.run_id),
                    "ts": event.ts.isoformat(),
                    "type": event.type,
                    "payload": event.payload,
                }
            )
    except WebSocketDisconnect:
        log.info("ws_disconnect", run_id=str(run_id))
    except Exception:  # noqa: BLE001
        log.exception("ws_error", run_id=str(run_id))
    finally:
        await unsubscribe(run_id, queue)
