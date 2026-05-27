"""load_skill tool — progressive disclosure for agent skills.

Auto-injected into any agent that has skills configured. The agent calls
this to load the full instructions for a skill before using it, keeping
context tokens lean until the skill is actually needed.
"""

from __future__ import annotations

from app.tools.registry import tool


@tool(
    description=(
        "Load the full instructions for one of your configured skills. "
        "Call this when you need to use a skill — pass the skill slug "
        "(e.g. 'research', 'writing') to retrieve the complete procedure."
    )
)
async def load_skill(slug: str) -> dict:
    from app.skills import SKILLS_REGISTRY

    spec = SKILLS_REGISTRY.get(slug)
    if spec is None:
        return {"error": f"Skill '{slug}' not found. Available: {list(SKILLS_REGISTRY)}"}
    return {"name": spec.name, "instructions": spec.instructions}
