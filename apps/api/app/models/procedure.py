import uuid
from datetime import date, datetime, timezone

from pgvector.sqlalchemy import Vector
from sqlalchemy import BigInteger, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Procedure(Base):
    __tablename__ = "procedures"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_role_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("roles.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="active")
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    owner_role = relationship("Role", lazy="selectin")
    versions = relationship("ProcedureVersion", back_populates="procedure", lazy="selectin")
    task_links = relationship("TaskProcedureLink", back_populates="procedure", lazy="selectin")


class ProcedureVersion(Base):
    __tablename__ = "procedure_versions"
    __table_args__ = (
        UniqueConstraint("procedure_id", "version_number", name="uq_procedure_versions_procedure_id_version_number"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    procedure_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("procedures.id", ondelete="CASCADE"))
    version_number: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(50), default="draft")
    change_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    change_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    effective_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    content_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    content_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_asset_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    source_storage_key: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    source_mime: Mapped[str | None] = mapped_column(String(100), nullable=True)
    source_size: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    source_processing_status: Mapped[str] = mapped_column(String(50), default="pending")
    source_processing_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    embedding = mapped_column(Vector(3072), nullable=True)

    procedure = relationship("Procedure", back_populates="versions", lazy="selectin")
    training = relationship("Training", back_populates="procedure_version", uselist=False, lazy="selectin")
    transcript = relationship("ProcedureVersionTranscript", back_populates="procedure_version", uselist=False, lazy="selectin")
    chunks = relationship("ProcedureVersionChunk", back_populates="procedure_version", lazy="selectin")
    frames = relationship("VideoFrame", back_populates="procedure_version", lazy="selectin")
    semantic_segments = relationship("SemanticSegment", back_populates="procedure_version", lazy="selectin")
    step_indexes = relationship("ProcedureStepIndex", back_populates="procedure_version", lazy="selectin")
    source_structure = relationship(
        "ProcedureVersionStructure",
        back_populates="procedure_version",
        uselist=False,
        lazy="selectin",
    )


class ProcedureVersionTranscript(Base):
    __tablename__ = "procedure_version_transcripts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    procedure_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("procedure_versions.id", ondelete="CASCADE"),
        unique=True,
    )
    transcript_raw: Mapped[str] = mapped_column(Text)
    language: Mapped[str | None] = mapped_column(String(10), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    procedure_version = relationship("ProcedureVersion", back_populates="transcript", lazy="selectin")


class ProcedureVersionChunk(Base):
    __tablename__ = "procedure_version_chunks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    procedure_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("procedure_versions.id", ondelete="CASCADE"),
    )
    chunk_index: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    start_time: Mapped[float] = mapped_column(Float)
    end_time: Mapped[float] = mapped_column(Float)
    embedding = mapped_column(Vector(3072), nullable=True)

    procedure_version = relationship("ProcedureVersion", back_populates="chunks", lazy="selectin")


class ProcedureVersionStructure(Base):
    __tablename__ = "procedure_version_structure"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    procedure_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("procedure_versions.id", ondelete="CASCADE"),
        unique=True,
    )
    structure_json: Mapped[dict] = mapped_column(JSONB)

    procedure_version = relationship("ProcedureVersion", back_populates="source_structure", lazy="selectin")


class ProcedureSourcePreview(Base):
    __tablename__ = "procedure_source_previews"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    storage_key: Mapped[str] = mapped_column(String(1000), nullable=False, index=True)
    source_asset_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    source_mime: Mapped[str | None] = mapped_column(String(100), nullable=True)
    source_size: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    transcript_segments_json: Mapped[list[dict]] = mapped_column(JSONB)
    raw_transcript: Mapped[str] = mapped_column(Text)
    frames_json: Mapped[list[dict]] = mapped_column(JSONB)
    segments_json: Mapped[list[dict]] = mapped_column(JSONB)
    structure_json: Mapped[dict] = mapped_column(JSONB)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class ProcedureStepIndex(Base):
    __tablename__ = "procedure_step_index"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    procedure_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("procedure_versions.id", ondelete="CASCADE"),
        index=True,
    )
    step_index: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[str] = mapped_column(Text)
    reference_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    origin: Mapped[str] = mapped_column(String(50), default="auto")
    search_text: Mapped[str] = mapped_column(Text)
    embedding = mapped_column(Vector(3072), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    procedure_version = relationship("ProcedureVersion", back_populates="step_indexes", lazy="selectin")


class TaskProcedureLink(Base):
    __tablename__ = "task_procedure_links"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"))
    procedure_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("procedures.id", ondelete="CASCADE"))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)

    task = relationship("Task", back_populates="procedure_links", lazy="selectin")
    procedure = relationship("Procedure", back_populates="task_links", lazy="selectin")


class UserProcedureCompliance(Base):
    __tablename__ = "user_procedure_compliance"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    procedure_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("procedures.id", ondelete="CASCADE"))
    procedure_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("procedure_versions.id"), nullable=True
    )
    role_assignment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_role_assignments.id"), nullable=True
    )
    training_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trainings.id", ondelete="SET NULL"), nullable=True
    )
    assignment_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("assignments.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    evidence_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user = relationship("User", lazy="selectin")
    procedure = relationship("Procedure", lazy="selectin")
    procedure_version = relationship("ProcedureVersion", lazy="selectin")
    role_assignment = relationship("UserRoleAssignment", lazy="selectin")
    training = relationship("Training", lazy="selectin")
    assignment = relationship("Assignment", lazy="selectin")
