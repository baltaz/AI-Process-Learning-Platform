import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.incident import Incident, IncidentTrainingLink
from app.models.semantic_segment import SemanticSegment
from app.models.training import Training
from app.models.user import User
from app.schemas.incident import IncidentCreate, IncidentLinkRequest, IncidentOut
from app.schemas.task import TrainingSuggestion
from app.services.embedding_service import get_embedding

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.post("", response_model=IncidentOut, status_code=status.HTTP_201_CREATED)
async def create_incident(
    payload: IncidentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    embedding = await get_embedding(payload.description)

    incident = Incident(
        description=payload.description,
        severity=payload.severity,
        role=payload.role,
        location=payload.location,
        created_by=current_user.id,
        embedding=embedding,
    )
    db.add(incident)
    await db.commit()
    await db.refresh(incident)
    return incident


@router.get("", response_model=list[IncidentOut])
async def list_incidents(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Incident).order_by(Incident.created_at.desc()))
    return result.scalars().all()


@router.get("/{incident_id}/suggest-trainings", response_model=list[TrainingSuggestion])
async def suggest_trainings_for_incident(
    incident_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    if incident.embedding is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incident has no embedding")

    query = (
        select(
            SemanticSegment.training_id,
            SemanticSegment.text_fused,
            SemanticSegment.embedding.cosine_distance(incident.embedding).label("distance"),
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


@router.post("/{incident_id}/link-training", status_code=status.HTTP_201_CREATED)
async def link_training_to_incident(
    incident_id: uuid.UUID,
    payload: IncidentLinkRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    result = await db.execute(select(Training).where(Training.id == payload.training_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Training not found")

    link = IncidentTrainingLink(
        incident_id=incident_id,
        training_id=payload.training_id,
        source=payload.source,
    )
    db.add(link)
    await db.commit()
    return {"detail": "Training linked to incident"}
