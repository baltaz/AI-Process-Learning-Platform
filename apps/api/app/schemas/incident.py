import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.task import TrainingSuggestion


class IncidentCreate(BaseModel):
    description: str
    severity: str = "medium"
    role: str | None = None
    location: str | None = None


class IncidentOut(BaseModel):
    id: uuid.UUID
    description: str
    severity: str
    role: str | None
    location: str | None
    created_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class IncidentLinkRequest(BaseModel):
    training_id: uuid.UUID
    source: str = "manual"
