"""Add preview cache and procedure step index

Revision ID: 009_preview_cache_step_index
Revises: 008_incident_findings
Create Date: 2026-03-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision: str = "009_preview_cache_step_index"
down_revision: Union[str, None] = "008_incident_findings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "procedure_source_previews",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("storage_key", sa.String(length=1000), nullable=False),
        sa.Column("source_asset_type", sa.String(length=50), nullable=True),
        sa.Column("source_mime", sa.String(length=100), nullable=True),
        sa.Column("source_size", sa.BigInteger(), nullable=True),
        sa.Column("transcript_segments_json", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("raw_transcript", sa.Text(), nullable=False),
        sa.Column("frames_json", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("segments_json", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("structure_json", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_by",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_procedure_source_previews_storage_key",
        "procedure_source_previews",
        ["storage_key"],
        unique=False,
    )
    op.create_index(
        "ix_procedure_source_previews_expires_at",
        "procedure_source_previews",
        ["expires_at"],
        unique=False,
    )

    op.create_table(
        "procedure_step_index",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "procedure_version_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("procedure_versions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("step_index", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("reference_json", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("origin", sa.String(length=50), nullable=False, server_default="auto"),
        sa.Column("search_text", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(3072), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.alter_column("procedure_step_index", "origin", server_default=None)
    op.create_index(
        "ix_procedure_step_index_procedure_version_id",
        "procedure_step_index",
        ["procedure_version_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_procedure_step_index_procedure_version_id", table_name="procedure_step_index")
    op.drop_table("procedure_step_index")

    op.drop_index("ix_procedure_source_previews_expires_at", table_name="procedure_source_previews")
    op.drop_index("ix_procedure_source_previews_storage_key", table_name="procedure_source_previews")
    op.drop_table("procedure_source_previews")
