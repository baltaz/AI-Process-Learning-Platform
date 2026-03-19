import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.change_event import ChangeEvent, ProcedureImpactAssessment
from app.models.user import User
from app.schemas.change_event import ChangeEventCreate, ChangeEventOut, ProcedureImpactAssessmentOut
from app.services.embedding_service import get_embedding
from app.services.search_service import rank_procedure_versions_by_embedding

router = APIRouter(prefix="/change-events", tags=["change-events"])


@router.get("", response_model=list[ChangeEventOut])
async def list_change_events(db: AsyncSession = Depends(get_db)):
    return list((await db.execute(select(ChangeEvent).order_by(ChangeEvent.created_at.desc()))).scalars().all())


@router.post("", response_model=ChangeEventOut, status_code=status.HTTP_201_CREATED)
async def create_change_event(
    payload: ChangeEventCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    embedding = await get_embedding(f"{payload.title}\n{payload.description}")
    item = ChangeEvent(created_by=current_user.id, embedding=embedding, **payload.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.get("/{change_event_id}/impact-assessments", response_model=list[ProcedureImpactAssessmentOut])
async def get_impact_assessments(change_event_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    rows = list(
        (
            await db.execute(
                select(ProcedureImpactAssessment).where(ProcedureImpactAssessment.change_event_id == change_event_id)
            )
        )
        .scalars()
        .all()
    )
    return [
        ProcedureImpactAssessmentOut(
            id=row.id,
            change_event_id=row.change_event_id,
            procedure_id=row.procedure_id,
            procedure_title=row.procedure.title,
            procedure_version_id=row.procedure_version_id,
            version_number=row.procedure_version.version_number if row.procedure_version else None,
            training_id=row.procedure_version.training.id if row.procedure_version and row.procedure_version.training else None,
            training_title=(
                row.procedure_version.training.title if row.procedure_version and row.procedure_version.training else None
            ),
            confidence=row.confidence,
            impact_level=row.impact_level,
            rationale=row.rationale,
            recommendation=row.recommendation,
            status=row.status,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.post(
    "/{change_event_id}/analyze-impact",
    response_model=list[ProcedureImpactAssessmentOut],
    status_code=status.HTTP_201_CREATED,
)
async def analyze_change_event_impact(
    change_event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    change_event = (await db.execute(select(ChangeEvent).where(ChangeEvent.id == change_event_id))).scalar_one_or_none()
    if change_event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change event not found")
    if change_event.embedding is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Change event has no embedding")

    existing = list(
        (
            await db.execute(
                select(ProcedureImpactAssessment).where(ProcedureImpactAssessment.change_event_id == change_event_id)
            )
        )
        .scalars()
        .all()
    )
    for row in existing:
        await db.delete(row)
    await db.flush()

    results: list[ProcedureImpactAssessment] = []
    matches = await rank_procedure_versions_by_embedding(change_event.embedding, limit=5, db=db, min_score=0.5)
    for match in matches:
        confidence = match["score"]
        impact_level = "high" if confidence >= 0.8 else "medium" if confidence >= 0.6 else "low"
        assessment = ProcedureImpactAssessment(
            change_event_id=change_event_id,
            procedure_id=match["procedure_id"],
            procedure_version_id=match["procedure_version_id"],
            confidence=confidence,
            impact_level=impact_level,
            rationale=(
                f"Coincidencia semántica con {match['procedure_code']} v{match['version_number']} "
                f"{f'en el paso {match['step_index']}: {match['step_title']} ' if match.get('step_title') else ''}"
                f"basada en el fragmento: {match['snippet']}"
            ),
            recommendation="Revisar si la versión vigente debe actualizarse y si corresponde recapacitación.",
            status="pending_review",
        )
        db.add(assessment)
        results.append(assessment)

    await db.commit()
    for row in results:
        await db.refresh(row)
    return [
        ProcedureImpactAssessmentOut(
            id=row.id,
            change_event_id=row.change_event_id,
            procedure_id=row.procedure_id,
            procedure_title=row.procedure.title,
            procedure_version_id=row.procedure_version_id,
            version_number=row.procedure_version.version_number if row.procedure_version else None,
            training_id=row.procedure_version.training.id if row.procedure_version and row.procedure_version.training else None,
            training_title=(
                row.procedure_version.training.title if row.procedure_version and row.procedure_version.training else None
            ),
            confidence=row.confidence,
            impact_level=row.impact_level,
            rationale=row.rationale,
            recommendation=row.recommendation,
            status=row.status,
            created_at=row.created_at,
        )
        for row in results
    ]
