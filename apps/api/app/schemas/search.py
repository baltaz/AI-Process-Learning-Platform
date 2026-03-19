import uuid

from pydantic import BaseModel


class SearchResult(BaseModel):
    procedure_id: uuid.UUID
    procedure_version_id: uuid.UUID
    procedure_code: str
    procedure_title: str
    version_number: int
    training_id: uuid.UUID | None = None
    training_title: str | None = None
    snippet: str
    step_index: int | None = None
    step_title: str | None = None
    reference_segment_range: str | None = None
    reference_quote: str | None = None
    match_source: str | None = None
    start_time: float | None = None
    end_time: float | None = None
    score: float
