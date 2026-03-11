import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.ai_usage_event import AIUsageEvent
from app.models.job import Job
from app.models.quiz import QuizQuestion
from app.models.training import Training, TrainingAsset, TrainingStructure
from app.models.user import User
from app.schemas.ai_usage import AIUsageEventOut, TrainingCostSummaryOut
from app.schemas.job import JobOut
from app.schemas.quiz import QuizQuestionOut
from app.schemas.training import (
    GenerateResponse,
    TrainingAssetCreate,
    TrainingAssetOut,
    TrainingCreate,
    TrainingIterateRequest,
    TrainingOut,
)
from app.services.ai_pipeline import run_pipeline

router = APIRouter(prefix="/trainings", tags=["trainings"])


@router.post("", response_model=TrainingOut, status_code=status.HTTP_201_CREATED)
async def create_training(
    payload: TrainingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    training = Training(title=payload.title, created_by=current_user.id)
    db.add(training)
    await db.commit()
    await db.refresh(training)
    return training


@router.get("", response_model=list[TrainingOut])
async def list_trainings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Training).order_by(Training.created_at.desc()))
    return result.scalars().all()


@router.get("/{training_id}", response_model=TrainingOut)
async def get_training(training_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Training).where(Training.id == training_id))
    training = result.scalar_one_or_none()
    if not training:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Training not found")
    return training


@router.delete("/{training_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_training(
    training_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Training).where(Training.id == training_id))
    training = result.scalar_one_or_none()
    if not training:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Training not found")

    await db.delete(training)
    await db.commit()


@router.get("/{training_id}/quiz", response_model=list[QuizQuestionOut])
async def get_quiz_questions(training_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(QuizQuestion).where(QuizQuestion.training_id == training_id)
    )
    questions = result.scalars().all()
    return sorted(
        questions,
        key=lambda q: (q.question_json.get("position", 10**9), str(q.id)),
    )


@router.post("/{training_id}/assets", response_model=TrainingAssetOut, status_code=status.HTTP_201_CREATED)
async def register_asset(
    training_id: uuid.UUID,
    payload: TrainingAssetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Training).where(Training.id == training_id))
    training = result.scalar_one_or_none()
    if not training:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Training not found")

    asset = TrainingAsset(
        training_id=training_id,
        type=payload.type,
        storage_key=payload.storage_key,
        mime=payload.mime,
        size=payload.size,
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    return asset


@router.post("/{training_id}/generate", response_model=GenerateResponse)
async def generate_training(
    training_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Training).where(Training.id == training_id))
    training = result.scalar_one_or_none()
    if not training:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Training not found")
    asset_result = await db.execute(
        select(TrainingAsset).where(
            TrainingAsset.training_id == training_id,
            TrainingAsset.type == "video",
        )
    )
    if asset_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debes subir un video antes de generar el borrador.",
        )

    job = Job(training_id=training_id, type="generate", status="UPLOADED", progress=0)
    db.add(job)
    await db.commit()
    await db.refresh(job)

    asyncio.create_task(run_pipeline(training_id, job.id))

    return GenerateResponse(job_id=job.id)


@router.post("/{training_id}/iterate", response_model=GenerateResponse)
async def iterate_training(
    training_id: uuid.UUID,
    payload: TrainingIterateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Training).where(Training.id == training_id))
    training = result.scalar_one_or_none()
    if not training:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Training not found")

    job = Job(training_id=training_id, type="iterate", status="UPLOADED", progress=0)
    db.add(job)
    await db.commit()
    await db.refresh(job)

    asyncio.create_task(run_pipeline(training_id, job.id, instruction=payload.instruction))

    return GenerateResponse(job_id=job.id)


@router.post("/{training_id}/publish", response_model=TrainingOut)
async def publish_training(
    training_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Training).where(Training.id == training_id))
    training = result.scalar_one_or_none()
    if not training:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Training not found")

    training.status = "published"
    await db.commit()
    await db.refresh(training)
    return training


@router.get("/jobs/{job_id}", response_model=JobOut)
async def get_job(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job


@router.get("/{training_id}/cost-summary", response_model=TrainingCostSummaryOut)
async def get_training_cost_summary(
    training_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Training).where(Training.id == training_id))
    training = result.scalar_one_or_none()
    if not training:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Training not found")

    events_result = await db.execute(
        select(AIUsageEvent)
        .where(AIUsageEvent.training_id == training_id)
        .order_by(AIUsageEvent.created_at.asc())
    )
    events = events_result.scalars().all()

    totals_result = await db.execute(
        select(
            func.coalesce(func.sum(AIUsageEvent.request_count), 0),
            func.coalesce(func.sum(AIUsageEvent.input_tokens), 0),
            func.coalesce(func.sum(AIUsageEvent.output_tokens), 0),
            func.coalesce(func.sum(AIUsageEvent.estimated_cost_usd), 0.0),
        ).where(AIUsageEvent.training_id == training_id)
    )
    total_requests, total_input_tokens, total_output_tokens, total_estimated_cost_usd = totals_result.one()

    return TrainingCostSummaryOut(
        training_id=training_id,
        total_requests=int(total_requests or 0),
        total_input_tokens=int(total_input_tokens or 0),
        total_output_tokens=int(total_output_tokens or 0),
        total_estimated_cost_usd=float(total_estimated_cost_usd or 0.0),
        events=[AIUsageEventOut.model_validate(event) for event in events],
    )
