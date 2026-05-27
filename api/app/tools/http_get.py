"""http_get — fetch a URL and return the response body.

Intentionally simple: GET only, no auth, 64 KB cap on returned body.
The agent shouldn't be exfiltrating bytes; it should be reading
documents that humans pointed it to.
"""

from __future__ import annotations

from typing import Any

import httpx

from app.tools.registry import tool


MAX_BYTES = 64 * 1024


@tool(
    description=(
        "Fetch a URL with HTTP GET and return the response text. "
        "Truncated to 64 KB. Use for reading public documentation, APIs, "
        "or articles when the URL is already known."
    )
)
async def http_get(url: str) -> dict[str, Any]:
    """Returns {status: int, body: str, truncated: bool, error: str|None}."""
    if not url.startswith(("http://", "https://")):
        return {
            "status": 0,
            "body": "",
            "truncated": False,
            "error": "url must start with http:// or https://",
        }
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(url)
    except httpx.HTTPError as e:
        return {"status": 0, "body": "", "truncated": False, "error": f"http_get failed: {e}"}

    body = resp.text
    truncated = len(body.encode("utf-8")) > MAX_BYTES
    if truncated:
        body = body.encode("utf-8")[:MAX_BYTES].decode("utf-8", errors="ignore")

    return {"status": resp.status_code, "body": body, "truncated": truncated, "error": None}
