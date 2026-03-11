import uuid

from pydantic import BaseModel

from app.schemas.generated_content import GeneratedQuizQuestion


class QuizQuestionOut(BaseModel):
    id: uuid.UUID
    training_id: uuid.UUID
    question_json: GeneratedQuizQuestion

    model_config = {"from_attributes": True}


class QuizSubmission(BaseModel):
    answers: list[dict]
