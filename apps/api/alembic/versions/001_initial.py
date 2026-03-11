"""Initial schema with pgvector

Revision ID: 001_initial
Revises:
Create Date: 2026-03-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "users",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.String(100), server_default="employee"),
        sa.Column("location", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "trainings",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("status", sa.String(50), server_default="draft"),
        sa.Column("created_by", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "training_assets",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("training_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("trainings.id", ondelete="CASCADE")),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("storage_key", sa.String(1000), nullable=False),
        sa.Column("mime", sa.String(100), nullable=True),
        sa.Column("size", sa.BigInteger, nullable=True),
    )

    op.create_table(
        "training_transcripts",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("training_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("trainings.id", ondelete="CASCADE"), unique=True),
        sa.Column("transcript_raw", sa.Text, nullable=False),
        sa.Column("language", sa.String(10), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "training_chunks",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("training_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("trainings.id", ondelete="CASCADE")),
        sa.Column("chunk_index", sa.Integer, nullable=False),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("start_time", sa.Float, nullable=False),
        sa.Column("end_time", sa.Float, nullable=False),
        sa.Column("embedding", Vector(3072), nullable=True),
    )

    op.create_table(
        "training_structure",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("training_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("trainings.id", ondelete="CASCADE"), unique=True),
        sa.Column("structure_json", sa.dialects.postgresql.JSONB, nullable=False),
    )

    op.create_table(
        "quiz_questions",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("training_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("trainings.id", ondelete="CASCADE")),
        sa.Column("question_json", sa.dialects.postgresql.JSONB, nullable=False),
    )

    op.create_table(
        "jobs",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("training_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("trainings.id", ondelete="CASCADE")),
        sa.Column("type", sa.String(50), server_default="generate"),
        sa.Column("status", sa.String(50), server_default="UPLOADED"),
        sa.Column("progress", sa.Integer, server_default="0"),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "assignments",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("training_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("trainings.id", ondelete="CASCADE")),
        sa.Column("user_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("due_date", sa.Date, nullable=True),
        sa.Column("status", sa.String(50), server_default="assigned"),
        sa.Column("score", sa.Integer, nullable=True),
        sa.Column("attempts", sa.Integer, server_default="0"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "tasks",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("role", sa.String(100), nullable=True),
        sa.Column("location", sa.String(255), nullable=True),
        sa.Column("embedding", Vector(3072), nullable=True),
    )

    op.create_table(
        "task_training_links",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("task_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="CASCADE")),
        sa.Column("training_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("trainings.id", ondelete="CASCADE")),
    )

    op.create_table(
        "incidents",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("severity", sa.String(50), server_default="medium"),
        sa.Column("role", sa.String(100), nullable=True),
        sa.Column("location", sa.String(255), nullable=True),
        sa.Column("created_by", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("embedding", Vector(3072), nullable=True),
    )

    op.create_table(
        "incident_training_links",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("incident_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("incidents.id", ondelete="CASCADE")),
        sa.Column("training_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("trainings.id", ondelete="CASCADE")),
        sa.Column("source", sa.String(50), server_default="suggested"),
        sa.Column("confidence", sa.Float, nullable=True),
    )

    op.create_table(
        "video_frames",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("training_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("trainings.id", ondelete="CASCADE")),
        sa.Column("timestamp", sa.Float, nullable=False),
        sa.Column("storage_key", sa.String(1000), nullable=False),
        sa.Column("caption", sa.Text, nullable=True),
    )

    op.create_table(
        "semantic_segments",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("training_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("trainings.id", ondelete="CASCADE")),
        sa.Column("start_time", sa.Float, nullable=False),
        sa.Column("end_time", sa.Float, nullable=False),
        sa.Column("text_fused", sa.Text, nullable=False),
        sa.Column("embedding", Vector(3072), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("semantic_segments")
    op.drop_table("video_frames")
    op.drop_table("incident_training_links")
    op.drop_table("incidents")
    op.drop_table("task_training_links")
    op.drop_table("tasks")
    op.drop_table("assignments")
    op.drop_table("jobs")
    op.drop_table("quiz_questions")
    op.drop_table("training_structure")
    op.drop_table("training_chunks")
    op.drop_table("training_transcripts")
    op.drop_table("training_assets")
    op.drop_table("trainings")
    op.drop_table("users")
    op.execute("DROP EXTENSION IF EXISTS vector")
