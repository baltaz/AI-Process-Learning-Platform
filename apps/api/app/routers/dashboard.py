from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.assignment import Assignment
from app.models.incident import Incident, IncidentTrainingLink
from app.models.training import Training
from app.schemas.dashboard import DashboardStats

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardStats)
async def get_dashboard(db: AsyncSession = Depends(get_db)):
    total_trainings_result = await db.execute(select(func.count(Training.id)))
    total_trainings = total_trainings_result.scalar() or 0

    total_assignments_result = await db.execute(select(func.count(Assignment.id)))
    total_assignments = total_assignments_result.scalar() or 0

    if total_assignments > 0:
        completed_result = await db.execute(
            select(func.count(Assignment.id)).where(Assignment.status == "completed")
        )
        completed = completed_result.scalar() or 0
        completion_rate = round((completed / total_assignments) * 100, 1)
    else:
        completion_rate = 0.0

    avg_score_result = await db.execute(
        select(func.avg(Assignment.score)).where(Assignment.score.isnot(None))
    )
    average_score = avg_score_result.scalar()
    if average_score is not None:
        average_score = round(float(average_score), 1)

    now = datetime.now(timezone.utc)
    overdue_result = await db.execute(
        select(func.count(Assignment.id)).where(
            Assignment.status != "completed",
            Assignment.due_date < now.date(),
            Assignment.due_date.isnot(None),
        )
    )
    overdue_count = overdue_result.scalar() or 0

    top_incidents_query = (
        select(
            Incident.id,
            Incident.description,
            Incident.severity,
            Incident.created_at,
            func.count(IncidentTrainingLink.id).label("linked_trainings"),
        )
        .outerjoin(IncidentTrainingLink, Incident.id == IncidentTrainingLink.incident_id)
        .group_by(Incident.id)
        .order_by(Incident.created_at.desc())
        .limit(5)
    )
    result = await db.execute(top_incidents_query)
    top_incidents = [
        {
            "id": str(row.id),
            "description": row.description,
            "severity": row.severity,
            "created_at": row.created_at.isoformat(),
            "linked_trainings": row.linked_trainings,
        }
        for row in result.all()
    ]

    return DashboardStats(
        total_trainings=total_trainings,
        total_assignments=total_assignments,
        completion_rate=completion_rate,
        average_score=average_score,
        overdue_count=overdue_count,
        top_incidents=top_incidents,
    )
