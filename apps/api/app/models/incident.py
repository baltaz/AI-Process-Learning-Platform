import uuid
from datetime import datetime, timezone

from pgvector.sqlalchemy import Vector
from sqlalchemy import String, Text, DateTime, Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    description: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(50), default="medium")
    status: Mapped[str] = mapped_column(String(50), default="open")
    role_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("roles.id"), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    closed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    embedding = mapped_column(Vector(3072), nullable=True)

    analysis_runs = relationship("IncidentAnalysisRun", back_populates="incident", lazy="selectin")
    role = relationship("Role", lazy="selectin")


class IncidentTrainingLink(Base):
    __tablename__ = "incident_training_links"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    incident_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("incidents.id", ondelete="CASCADE"))
    training_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trainings.id", ondelete="CASCADE"))
    source: Mapped[str] = mapped_column(String(50), default="suggested")
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)


class IncidentAnalysisRun(Base):
    __tablename__ = "incident_analysis_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    incident_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("incidents.id", ondelete="CASCADE"))
    source: Mapped[str] = mapped_column(String(50), default="ai")
    analysis_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolution_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    incident = relationship("Incident", back_populates="analysis_runs", lazy="selectin")
    findings = relationship(
        "IncidentAnalysisFinding",
        back_populates="analysis_run",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    related_matches = relationship(
        "IncidentRelatedMatch",
        back_populates="analysis_run",
        foreign_keys="IncidentRelatedMatch.analysis_run_id",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class IncidentAnalysisFinding(Base):
    __tablename__ = "incident_analysis_findings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    analysis_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("incident_analysis_runs.id", ondelete="CASCADE"),
    )
    procedure_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("procedure_versions.id", ondelete="SET NULL"),
        nullable=True,
    )
    finding_type: Mapped[str] = mapped_column(String(50), default="contributing_factor")
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    reasoning_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommended_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="suggested")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    analysis_run = relationship("IncidentAnalysisRun", back_populates="findings", lazy="selectin")
    procedure_version = relationship("ProcedureVersion", lazy="selectin")


class IncidentRelatedMatch(Base):
    __tablename__ = "incident_related_matches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    analysis_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("incident_analysis_runs.id", ondelete="CASCADE"),
    )
    related_incident_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("incidents.id", ondelete="CASCADE"),
    )
    related_analysis_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("incident_analysis_runs.id", ondelete="CASCADE"),
    )
    similarity_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    analysis_run = relationship(
        "IncidentAnalysisRun",
        back_populates="related_matches",
        foreign_keys=[analysis_run_id],
        lazy="selectin",
    )
    related_incident = relationship("Incident", lazy="selectin")
    related_analysis_run = relationship("IncidentAnalysisRun", foreign_keys=[related_analysis_run_id], lazy="selectin")
