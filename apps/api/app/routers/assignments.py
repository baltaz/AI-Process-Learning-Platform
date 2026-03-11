import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.assignment import Assignment
from app.models.quiz import QuizQuestion
from app.models.training import Training
from app.models.user import User
from app.schemas.assignment import AssignmentCreate, AssignmentOut
from app.schemas.quiz import QuizSubmission

router = APIRouter(prefix="/assignments", tags=["assignments"])


@router.post("", response_model=list[AssignmentOut], status_code=status.HTTP_201_CREATED)
async def create_assignments(
    payload: AssignmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Training).where(Training.id == payload.training_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Training not found")

    user_ids: list[uuid.UUID] = []
    if payload.user_ids:
        user_ids = payload.user_ids
    else:
        query = select(User.id)
        if payload.role:
            query = query.where(User.role == payload.role)
        if payload.location:
            query = query.where(User.location == payload.location)
        result = await db.execute(query)
        user_ids = list(result.scalars().all())

    if not user_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No users matched the criteria")

    assignments = []
    for uid in user_ids:
        assignment = Assignment(
            training_id=payload.training_id,
            user_id=uid,
            due_date=payload.due_date,
            status="assigned",
        )
        db.add(assignment)
        assignments.append(assignment)

    await db.commit()
    for a in assignments:
        await db.refresh(a)

    return assignments


@router.get("", response_model=list[AssignmentOut])
async def list_assignments(
    training_id: uuid.UUID | None = Query(None),
    user_id: uuid.UUID | None = Query(None),
    assignment_status: str | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
):
    query = select(Assignment)
    if training_id:
        query = query.where(Assignment.training_id == training_id)
    if user_id:
        query = query.where(Assignment.user_id == user_id)
    if assignment_status:
        query = query.where(Assignment.status == assignment_status)

    result = await db.execute(query.order_by(Assignment.due_date.asc().nullslast()))
    return result.scalars().all()


@router.post("/{assignment_id}/submit", response_model=AssignmentOut)
async def submit_quiz(
    assignment_id: uuid.UUID,
    payload: QuizSubmission,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Assignment).where(Assignment.id == assignment_id))
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    if assignment.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your assignment")

    result = await db.execute(
        select(QuizQuestion).where(QuizQuestion.training_id == assignment.training_id)
    )
    questions = result.scalars().all()

    if not questions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No quiz questions available")

    question_map = {str(q.id): q for q in questions}
    correct = 0
    total = len(questions)

    for answer in payload.answers:
        qid = answer.get("question_id")
        selected = answer.get("selected")
        question = question_map.get(qid)
        if question and question.question_json.get("correct_answer") == selected:
            correct += 1

    score = round((correct / total) * 100) if total > 0 else 0

    assignment.score = score
    assignment.attempts += 1
    assignment.status = "completed"
    assignment.completed_at = datetime.now(timezone.utc)
    if not assignment.started_at:
        assignment.started_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(assignment)
    return assignment
