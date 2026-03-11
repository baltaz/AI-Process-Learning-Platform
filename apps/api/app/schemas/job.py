import uuid
from datetime import datetime

from pydantic import BaseModel


class JobOut(BaseModel):
    id: uuid.UUID
    training_id: uuid.UUID
    type: str
    status: str
    progress: int
    error: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
