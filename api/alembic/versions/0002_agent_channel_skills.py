"""fresh channel model + agent channel/skills/interaction_rules

Revision ID: 0002_agent_channel_skills
Revises: 0001_initial
Create Date: 2026-05-27
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON, UUID

from alembic import op

revision: str = "0002_agent_channel_skills"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- agents: 4 new columns ------------------------------------------
    op.add_column("agents", sa.Column("channel_kind", sa.String(20), nullable=True))
    op.add_column(
        "agents",
        sa.Column("channel_config", JSON(), nullable=False, server_default="{}"),
    )
    op.add_column(
        "agents",
        sa.Column("skills", JSON(), nullable=False, server_default="[]"),
    )
    op.add_column(
        "agents",
        sa.Column("interaction_rules", JSON(), nullable=False, server_default="{}"),
    )

    # --- channels: fresh redesign (agent-bound only) --------------------
    # Truncate stale data (fresh start per design decision).
    op.execute("TRUNCATE TABLE channels")
    # Drop old workflow_id column (PostgreSQL auto-drops its FK constraint).
    op.drop_column("channels", "workflow_id")
    # Add agent_id NOT NULL FK.
    op.add_column(
        "channels",
        sa.Column("agent_id", UUID(as_uuid=True), nullable=False),
    )
    op.create_foreign_key(
        "fk_channels_agent_id",
        "channels",
        "agents",
        ["agent_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_channels_agent_id", "channels", ["agent_id"])


def downgrade() -> None:
    op.drop_index("ix_channels_agent_id", "channels")
    op.drop_constraint("fk_channels_agent_id", "channels", type_="foreignkey")
    op.drop_column("channels", "agent_id")
    op.add_column(
        "channels",
        sa.Column(
            "workflow_id",
            UUID(as_uuid=True),
            sa.ForeignKey("workflows.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.drop_column("agents", "interaction_rules")
    op.drop_column("agents", "skills")
    op.drop_column("agents", "channel_config")
    op.drop_column("agents", "channel_kind")
