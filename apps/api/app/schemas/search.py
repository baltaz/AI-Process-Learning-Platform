import uuid

from pydantic import BaseModel


class SearchResult(BaseModel):
    training_id: uuid.UUID
    training_title: str
    snippet: str
    start_time: float
    end_time: float
    score: float
