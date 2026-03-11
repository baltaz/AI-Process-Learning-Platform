import uuid

from pydantic import BaseModel


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    role: str | None = None
    location: str | None = None


class TaskOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    role: str | None
    location: str | None

    model_config = {"from_attributes": True}


class TrainingSuggestion(BaseModel):
    training_id: uuid.UUID
    title: str
    score: float
    snippet: str | None = None
