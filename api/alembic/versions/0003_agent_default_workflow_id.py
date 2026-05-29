"""add default_workflow_id to agents

Revision ID: 0003_agent_default_workflow_id
Revises: 0002_agent_channel_skills
Create Date: 2026-05-29
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision: str = "0003_agent_default_workflow_id"
down_revision: str | None = "0002_agent_channel_skills"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "agents",
        sa.Column("default_workflow_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_agents_default_workflow_id",
        "agents",
        "workflows",
        ["default_workflow_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_agents_default_workflow_id", "agents", ["default_workflow_id"])


def downgrade() -> None:
    op.drop_index("ix_agents_default_workflow_id", "agents")
    op.drop_constraint("fk_agents_default_workflow_id", "agents", type_="foreignkey")
    op.drop_column("agents", "default_workflow_id")
