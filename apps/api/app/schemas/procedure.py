import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas.generated_content import GeneratedTrainingStructure


class ProcedureVersionSourceAssetWrite(BaseModel):
    storage_key: str
    mime: str | None = None
    size: int | None = None
    asset_type: str = "video"


class ProcedureCreate(BaseModel):
    title: str = Field(min_length=1)
    description: str | None = None
    owner_role_id: uuid.UUID | None = None
    source_asset: ProcedureVersionSourceAssetWrite | None = None


class ProcedureUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    description: str | None = None
    owner_role_id: uuid.UUID | None = None


class ProcedureVersionCreate(BaseModel):
    change_summary: str | None = None
    change_reason: str | None = None
    effective_from: date | None = None
    content_json: dict | None = None
    content_text: str = Field(min_length=1)
    status: str = "draft"
    source_asset: ProcedureVersionSourceAssetWrite | None = None
    source_preview_id: uuid.UUID | None = None
    recalculate_compliance: bool = False


class ProcedureVersionUpdate(BaseModel):
    change_summary: str | None = None
    change_reason: str | None = None
    effective_from: date | None = None
    content_json: dict | None = None
    content_text: str = Field(min_length=1)
    status: str | None = None
    source_asset: ProcedureVersionSourceAssetWrite | None = None
    source_preview_id: uuid.UUID | None = None


class TaskProcedureLinkCreate(BaseModel):
    task_id: uuid.UUID
    procedure_id: uuid.UUID
    is_primary: bool = False


class ProcedureVersionSourceResultOut(BaseModel):
    structure: GeneratedTrainingStructure
    transcript_raw: str = Field(min_length=1)


class ProcedureSourcePreviewRequest(BaseModel):
    source_asset: ProcedureVersionSourceAssetWrite


class ProcedureSourcePreviewOut(BaseModel):
    preview_id: uuid.UUID
    source_result: ProcedureVersionSourceResultOut
    suggested_content_json: dict
    suggested_content_text: str = Field(min_length=1)


class ProcedureVersionOut(BaseModel):
    id: uuid.UUID
    procedure_id: uuid.UUID
    version_number: int
    status: str
    change_summary: str | None
    change_reason: str | None
    effective_from: date | None
    content_json: dict | None
    content_text: str | None
    source_asset_type: str | None = None
    source_storage_key: str | None = None
    source_mime: str | None = None
    source_size: int | None = None
    source_processing_status: str
    source_processing_error: str | None = None
    source_processed_at: datetime | None = None
    source_result: ProcedureVersionSourceResultOut | None = None
    derived_training: dict | None = None
    created_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class ProcedureOut(BaseModel):
    id: uuid.UUID
    code: str
    title: str
    description: str | None
    owner_role_id: uuid.UUID | None
    owner_role_name: str | None = None
    status: str
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    latest_version: ProcedureVersionOut | None = None
    requires_update: bool = False


class ProcedureRoleRef(BaseModel):
    id: uuid.UUID
    role_id: uuid.UUID
    role_code: str
    role_name: str
    is_required: bool


class ProcedureIncidentSignalOut(BaseModel):
    incident_id: uuid.UUID
    incident_status: str
    incident_severity: str
    incident_description: str
    incident_location: str | None = None
    incident_created_at: datetime
    analysis_run_id: uuid.UUID
    analysis_summary: str | None = None
    resolution_summary: str | None = None
    finding_id: uuid.UUID
    finding_type: str
    finding_status: str
    confidence: float | None = None
    reasoning_summary: str | None = None
    recommended_action: str | None = None


class ProcedureDetailOut(ProcedureOut):
    versions: list[ProcedureVersionOut] = []
    linked_tasks: list[dict] = []
    roles: list[ProcedureRoleRef] = []
    incident_signals: list[ProcedureIncidentSignalOut] = []


class TaskProcedureLinkOut(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    task_title: str
    procedure_id: uuid.UUID
    procedure_title: str
    is_primary: bool


