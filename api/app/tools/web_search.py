"""web_search — search the web via Tavily.

Tavily was chosen over Brave/Serper because:
  - Free tier is generous enough for a demo.
  - Returns clean, summarized results without scraping.
  - Single API call (no follow-up fetches needed for snippets).

If TAVILY_API_KEY is unset, the tool returns a structured error rather
than raising — the agent can then choose to give up gracefully instead
of looping. That's important when reviewers run the project without
configuring every key.
"""

from __future__ import annotations

import os
from typing import Any

import httpx

from app.tools.registry import tool


TAVILY_ENDPOINT = "https://api.tavily.com/search"


@tool(
    description=(
        "Search the public web for up-to-date information. "
        "Returns a list of relevant results with titles, URLs, and short "
        "content snippets. Use this when the user asks about current events, "
        "facts, or anything that may have changed recently."
    )
)
async def web_search(query: str, max_results: int = 5) -> dict[str, Any]:
    """Search the web. Returns {results: [...], error: str|None}."""
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        return {
            "results": [],
            "error": "TAVILY_API_KEY is not configured on the server.",
        }

    payload = {
        "api_key": api_key,
        "query": query,
        "max_results": max(1, min(max_results, 10)),
        "search_depth": "basic",
        "include_answer": False,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.post(TAVILY_ENDPOINT, json=payload)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            return {"results": [], "error": f"web_search request failed: {e}"}

    data = resp.json()
    results = [
        {
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "content": r.get("content", ""),
        }
        for r in data.get("results", [])
    ]
    return {"results": results, "error": None}
