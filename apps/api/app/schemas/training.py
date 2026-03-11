import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.generated_content import GeneratedTrainingStructure


class TrainingCreate(BaseModel):
    title: str


class TrainingAssetCreate(BaseModel):
    type: str = "video"
    storage_key: str
    mime: str | None = None
    size: int | None = None


class TrainingAssetOut(BaseModel):
    id: uuid.UUID
    type: str
    storage_key: str
    mime: str | None
    size: int | None

    model_config = {"from_attributes": True}


class TrainingStructureOut(BaseModel):
    structure_json: GeneratedTrainingStructure

    model_config = {"from_attributes": True}


class TrainingOut(BaseModel):
    id: uuid.UUID
    title: str
    status: str
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    assets: list[TrainingAssetOut] = []
    structure: TrainingStructureOut | None = None

    model_config = {"from_attributes": True}


class TrainingIterateRequest(BaseModel):
    instruction: str


class GenerateResponse(BaseModel):
    job_id: uuid.UUID
