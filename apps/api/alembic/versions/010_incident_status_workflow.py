"""Add incident workflow status fields

Revision ID: 010_incident_status_workflow
Revises: 009_preview_cache_step_index
Create Date: 2026-03-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "010_incident_status_workflow"
down_revision: Union[str, None] = "009_preview_cache_step_index"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("incidents", sa.Column("status", sa.String(length=50), nullable=False, server_default="open"))
    op.add_column("incidents", sa.Column("closed_by", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("incidents", sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        "incidents_closed_by_fkey",
        "incidents",
        "users",
        ["closed_by"],
        ["id"],
    )
    op.alter_column("incidents", "status", server_default=None)


def downgrade() -> None:
    op.drop_constraint("incidents_closed_by_fkey", "incidents", type_="foreignkey")
    op.drop_column("incidents", "closed_at")
    op.drop_column("incidents", "closed_by")
    op.drop_column("incidents", "status")
