"""Skills registry: reads api/skills/*.md and exposes GET /skills routes.

Each skill file uses SKILL.md format:
  ---
  name: Human-readable name
  slug: machine-slug
  description: One-line description
  ---

  Full instructions body (Markdown).

The registry is loaded at import time. The load_skill tool (in
app/tools/load_skill.py) exposes full instructions to agents at runtime —
this is the progressive disclosure mechanism.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

_SKILLS_DIR = Path(__file__).parent.parent / "skills"


@dataclass(frozen=True)
class SkillSpec:
    slug: str
    name: str
    description: str
    instructions: str


def _parse_skill_file(path: Path) -> SkillSpec:
    raw = path.read_text()
    if not raw.startswith("---"):
        raise ValueError(f"Skill file {path} missing YAML frontmatter")
    _, fm, body = raw.split("---", 2)
    meta = yaml.safe_load(fm)
    return SkillSpec(
        slug=meta["slug"],
        name=meta["name"],
        description=meta["description"],
        instructions=body.strip(),
    )


SKILLS_REGISTRY: dict[str, SkillSpec] = {}

for _f in sorted(_SKILLS_DIR.glob("*.md")):
    _spec = _parse_skill_file(_f)
    SKILLS_REGISTRY[_spec.slug] = _spec


def get_skills_overview(slugs: list[str]) -> str:
    """One-liner per skill for system prompt hints."""
    lines = [
        f"- {SKILLS_REGISTRY[s].name} ({s}): {SKILLS_REGISTRY[s].description}"
        for s in slugs
        if s in SKILLS_REGISTRY
    ]
    return "\n".join(lines)


# ── Routes ────────────────────────────────────────────────────────────────────


class SkillSummary(BaseModel):
    slug: str
    name: str
    description: str


class SkillDetail(SkillSummary):
    instructions: str


router = APIRouter(prefix="/skills", tags=["skills"])


@router.get("", response_model=list[SkillSummary])
async def list_skills() -> list[SkillSummary]:
    """Return skill metadata only (no full instructions — token-efficient)."""
    return [
        SkillSummary(slug=s.slug, name=s.name, description=s.description)
        for s in SKILLS_REGISTRY.values()
    ]


@router.get("/{slug}", response_model=SkillDetail)
async def get_skill(slug: str) -> SkillDetail:
    """Return full skill including instructions (progressive disclosure)."""
    spec = SKILLS_REGISTRY.get(slug)
    if spec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Skill '{slug}' not found.",
        )
    return SkillDetail(
        slug=spec.slug,
        name=spec.name,
        description=spec.description,
        instructions=spec.instructions,
    )
