import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class IncidentCreate(BaseModel):
    description: str
    severity: str = "medium"
    role_id: uuid.UUID | None = None
    location: str | None = None


class IncidentUpdate(BaseModel):
    description: str | None = None
    severity: str | None = None
    role_id: uuid.UUID | None = None
    location: str | None = None


class IncidentOut(BaseModel):
    id: uuid.UUID
    description: str
    severity: str
    role_id: uuid.UUID | None
    role_name: str | None = None
    role_code: str | None = None
    location: str | None
    created_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


FindingType = Literal["not_followed", "needs_redefinition", "missing_procedure", "contributing_factor"]


class IncidentAnalysisFindingCreate(BaseModel):
    procedure_version_id: uuid.UUID | None = None
    finding_type: FindingType
    confidence: float | None = None
    reasoning_summary: str | None = None
    recommended_action: str | None = None
    status: str = "suggested"

    @model_validator(mode="after")
    def validate_structure(self):
        if self.finding_type in {"not_followed", "needs_redefinition"} and self.procedure_version_id is None:
            raise ValueError("This finding type requires a procedure version")
        if self.finding_type == "missing_procedure" and self.procedure_version_id is not None:
            raise ValueError("Missing procedure findings cannot point to a procedure version")
        if self.procedure_version_id is None and not (
            self.reasoning_summary and self.reasoning_summary.strip()
        ):
            raise ValueError("Findings without procedure version require a reasoning summary")
        return self


class IncidentAnalysisFindingUpdate(IncidentAnalysisFindingCreate):
    pass


class IncidentAnalysisRunCreate(BaseModel):
    analysis_summary: str | None = None
    resolution_summary: str | None = None
    findings: list[IncidentAnalysisFindingCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_content(self):
        if not (self.analysis_summary and self.analysis_summary.strip()) and not (
            self.resolution_summary and self.resolution_summary.strip()
        ) and not self.findings:
            raise ValueError("At least one analysis field must be provided")
        return self


class IncidentAnalysisRunUpdate(BaseModel):
    analysis_summary: str | None = None
    resolution_summary: str | None = None
    findings: list[IncidentAnalysisFindingUpdate] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_content(self):
        if not (self.analysis_summary and self.analysis_summary.strip()) and not (
            self.resolution_summary and self.resolution_summary.strip()
        ) and not self.findings:
            raise ValueError("At least one analysis field must be provided")
        return self


class IncidentAnalysisFindingOut(BaseModel):
    id: uuid.UUID
    analysis_run_id: uuid.UUID
    procedure_id: uuid.UUID | None = None
    procedure_version_id: uuid.UUID | None = None
    procedure_title: str | None = None
    version_number: int | None = None
    training_id: uuid.UUID | None = None
    training_title: str | None = None
    finding_type: FindingType
    confidence: float | None = None
    reasoning_summary: str | None = None
    recommended_action: str | None = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class IncidentRelatedMatchOut(BaseModel):
    id: uuid.UUID
    related_incident_id: uuid.UUID
    related_incident_description: str
    related_analysis_run_id: uuid.UUID | None = None
    related_analysis_summary: str | None = None
    related_resolution_summary: str | None = None
    related_findings: list[IncidentAnalysisFindingOut] = Field(default_factory=list)
    similarity_score: float | None = None
    rationale: str | None = None


class IncidentAnalysisRunOut(BaseModel):
    id: uuid.UUID
    incident_id: uuid.UUID
    source: str
    analysis_summary: str | None = None
    resolution_summary: str | None = None
    created_at: datetime
    findings: list[IncidentAnalysisFindingOut] = Field(default_factory=list)
    related_matches: list[IncidentRelatedMatchOut] = Field(default_factory=list)


class IncidentLinkRequest(BaseModel):
    training_id: uuid.UUID
    source: str = "manual"
