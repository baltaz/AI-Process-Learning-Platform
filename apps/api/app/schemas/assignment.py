import uuid
from datetime import date, datetime

from pydantic import BaseModel


class AssignmentCreate(BaseModel):
    training_id: uuid.UUID
    user_ids: list[uuid.UUID] | None = None
    role: str | None = None
    location: str | None = None
    due_date: date | None = None


class AssignmentOut(BaseModel):
    id: uuid.UUID
    training_id: uuid.UUID
    user_id: uuid.UUID
    due_date: date | None
    status: str
    score: int | None
    attempts: int
    started_at: datetime | None
    completed_at: datetime | None

    model_config = {"from_attributes": True}
