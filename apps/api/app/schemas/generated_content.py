from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator


class StructureEvidence(BaseModel):
    model_config = ConfigDict(extra="ignore")

    segment_range: str = Field(min_length=1)

    @field_validator("segment_range")
    @classmethod
    def _strip_segment_range(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("segment_range cannot be empty")
        return value

    @model_validator(mode="before")
    @classmethod
    def _normalize_input(cls, value):
        if isinstance(value, str):
            return {"segment_range": value}
        if isinstance(value, dict):
            segment_range = value.get("segment_range") or value.get("segment_ref")
            return {"segment_range": segment_range}
        return value


class StructureStep(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = Field(min_length=1)
    description: str = Field(min_length=1)
    evidence: StructureEvidence

    @field_validator("title", "description")
    @classmethod
    def _strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("text cannot be empty")
        return value

    @model_validator(mode="before")
    @classmethod
    def _normalize_input(cls, value):
        if not isinstance(value, dict):
            return value
        evidence = value.get("evidence")
        segment_ref = value.get("segment_ref")
        if evidence is None and segment_ref is not None:
            evidence = {"segment_range": segment_ref}
        return {
            "title": value.get("title") or value.get("step"),
            "description": value.get("description"),
            "evidence": evidence,
        }


class CriticalPoint(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str = Field(min_length=1)
    why: str = Field(min_length=1)
    evidence: StructureEvidence

    @field_validator("text", "why")
    @classmethod
    def _strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("text cannot be empty")
        return value

    @model_validator(mode="before")
    @classmethod
    def _normalize_input(cls, value):
        if not isinstance(value, dict):
            return value
        evidence = value.get("evidence")
        segment_ref = value.get("segment_ref")
        if evidence is None and segment_ref is not None:
            evidence = {"segment_range": segment_ref}
        return {
            "text": value.get("text") or value.get("point"),
            "why": value.get("why"),
            "evidence": evidence,
        }


class GeneratedTrainingStructure(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = Field(min_length=1)
    objectives: list[str]
    steps: list[StructureStep]
    critical_points: list[CriticalPoint]

    @field_validator("title")
    @classmethod
    def _strip_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("title cannot be empty")
        return value

    @field_validator("objectives")
    @classmethod
    def _validate_objectives(cls, values: list[str]) -> list[str]:
        normalized = []
        for value in values:
            if not isinstance(value, str):
                raise ValueError("all objectives must be strings")
            value = value.strip()
            if not value:
                raise ValueError("objective cannot be empty")
            normalized.append(value)
        return normalized


class QuizEvidence(BaseModel):
    model_config = ConfigDict(extra="ignore")

    segment_range: str = Field(min_length=1)
    quote: str = Field(min_length=1)

    @field_validator("segment_range", "quote")
    @classmethod
    def _strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("text cannot be empty")
        return value


class GeneratedQuizQuestion(BaseModel):
    model_config = ConfigDict(extra="ignore")

    type: Literal["mcq"]
    question: str = Field(min_length=1)
    options: list[str] = Field(min_length=4, max_length=4)
    correct_answer: int
    evidence: QuizEvidence
    verified: bool = False
    position: int | None = None

    @field_validator("question")
    @classmethod
    def _strip_question(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("question cannot be empty")
        return value

    @field_validator("options")
    @classmethod
    def _validate_options(cls, values: list[str]) -> list[str]:
        normalized = []
        for value in values:
            if not isinstance(value, str):
                raise ValueError("all options must be strings")
            value = value.strip()
            if not value:
                raise ValueError("option cannot be empty")
            normalized.append(value)
        return normalized

    @model_validator(mode="after")
    def _validate_answer(self):
        if not 0 <= self.correct_answer < len(self.options):
            raise ValueError("correct_answer must reference an option index")
        if self.position is not None and self.position < 1:
            raise ValueError("position must be >= 1")
        return self


class GeneratedQuizResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    questions: list[GeneratedQuizQuestion]


def validate_training_structure(payload: dict) -> dict:
    return GeneratedTrainingStructure.model_validate(payload).model_dump(exclude_none=True)


def validate_quiz_question(payload: dict) -> dict:
    return GeneratedQuizQuestion.model_validate(payload).model_dump(exclude_none=True)


def validate_quiz_response(payload: dict) -> dict:
    return GeneratedQuizResponse.model_validate(payload).model_dump(exclude_none=True)


__all__ = [
    "GeneratedQuizQuestion",
    "GeneratedQuizResponse",
    "GeneratedTrainingStructure",
    "ValidationError",
    "validate_quiz_question",
    "validate_quiz_response",
    "validate_training_structure",
]
