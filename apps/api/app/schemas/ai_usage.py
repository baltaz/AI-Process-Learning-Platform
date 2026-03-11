import uuid
from datetime import datetime

from pydantic import BaseModel


class AIUsageEventOut(BaseModel):
    id: uuid.UUID
    training_id: uuid.UUID | None
    provider: str
    model: str
    operation: str
    stage: str | None
    input_tokens: int
    output_tokens: int
    request_count: int
    estimated_cost_usd: float
    metadata_json: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TrainingCostSummaryOut(BaseModel):
    training_id: uuid.UUID
    total_requests: int
    total_input_tokens: int
    total_output_tokens: int
    total_estimated_cost_usd: float
    events: list[AIUsageEventOut]
