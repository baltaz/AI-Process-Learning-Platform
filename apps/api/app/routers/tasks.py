import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.task import Task
from app.models.training import Training
from app.models.semantic_segment import SemanticSegment
from app.models.user import User
from app.schemas.task import TaskCreate, TaskOut, TrainingSuggestion
from app.services.embedding_service import get_embedding

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    text_for_embedding = f"{payload.title} {payload.description or ''}"
    embedding = await get_embedding(text_for_embedding)

    task = Task(
        title=payload.title,
        description=payload.description,
        role=payload.role,
        location=payload.location,
        embedding=embedding,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


@router.get("", response_model=list[TaskOut])
async def list_tasks(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Task))
    return result.scalars().all()


@router.post("/{task_id}/suggest-trainings", response_model=list[TrainingSuggestion])
async def suggest_trainings_for_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if task.embedding is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task has no embedding")

    query = (
        select(
            SemanticSegment.training_id,
            SemanticSegment.text_fused,
            SemanticSegment.embedding.cosine_distance(task.embedding).label("distance"),
        )
        .where(SemanticSegment.embedding.isnot(None))
        .order_by("distance")
        .limit(10)
    )
    result = await db.execute(query)
    rows = result.all()

    seen_training_ids: set[uuid.UUID] = set()
    suggestions: list[TrainingSuggestion] = []
    for row in rows:
        if row.training_id in seen_training_ids:
            continue
        seen_training_ids.add(row.training_id)

        t_result = await db.execute(select(Training).where(Training.id == row.training_id))
        training = t_result.scalar_one_or_none()
        if not training:
            continue

        suggestions.append(
            TrainingSuggestion(
                training_id=row.training_id,
                title=training.title,
                score=1 - row.distance,
                snippet=row.text_fused[:200],
            )
        )

    return suggestions
