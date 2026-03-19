import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.incident import (
    Incident,
    IncidentAnalysisFinding,
    IncidentAnalysisRun,
    IncidentRelatedMatch,
    IncidentTrainingLink,
)
from app.models.procedure import ProcedureVersion
from app.models.role import Role
from app.models.training import Training
from app.models.user import User
from app.schemas.incident import (
    IncidentAnalysisFindingOut,
    IncidentAnalysisRunCreate,
    IncidentAnalysisRunUpdate,
    IncidentAnalysisRunOut,
    IncidentCreate,
    IncidentLinkRequest,
    IncidentOut,
    IncidentRelatedMatchOut,
    IncidentUpdate,
)
from app.schemas.task import TrainingSuggestion
from app.services.embedding_service import get_embedding
from app.services.incident_memory_service import (
    analysis_run_load_options,
    build_incident_analysis_context,
    build_finding_memory_line,
    get_similar_incident_analysis_runs,
)
from app.services.search_service import rank_procedure_versions_by_embedding

router = APIRouter(prefix="/incidents", tags=["incidents"])
INCIDENT_REDEFINITION_HINTS = (
    "cambiar",
    "cambio",
    "ajustar",
    "actualizar",
    "redefin",
    "mejorar",
    "otra forma",
    "desactualiz",
    "insuficiente",
    "confuso",
    "ambigu",
    "no contempla",
)
INCIDENT_GAP_HINTS = (
    "no existe procedimiento",
    "falta procedimiento",
    "sin procedimiento",
    "sin protocolo",
    "no estaba definido",
    "no estaba especificado",
    "nadie sabia",
)


def _analysis_run_query():
    return select(IncidentAnalysisRun).options(*analysis_run_load_options())


def _incident_out(item: Incident) -> IncidentOut:
    return IncidentOut(
        id=item.id,
        description=item.description,
        severity=item.severity,
        status=item.status,
        role_id=item.role_id,
        role_name=item.role.name if getattr(item, "role", None) else None,
        role_code=item.role.code if getattr(item, "role", None) else None,
        location=item.location,
        created_by=item.created_by,
        created_at=item.created_at,
        closed_by=item.closed_by,
        closed_at=item.closed_at,
    )


def _finding_out(item: IncidentAnalysisFinding) -> IncidentAnalysisFindingOut:
    procedure_version = getattr(item, "procedure_version", None)
    procedure = getattr(procedure_version, "procedure", None) if procedure_version is not None else None
    training = getattr(procedure_version, "training", None) if procedure_version is not None else None
    return IncidentAnalysisFindingOut(
        id=item.id,
        analysis_run_id=item.analysis_run_id,
        procedure_id=procedure.id if procedure is not None else None,
        procedure_version_id=item.procedure_version_id,
        procedure_title=procedure.title if procedure is not None else None,
        version_number=procedure_version.version_number if procedure_version is not None else None,
        training_id=training.id if training is not None else None,
        training_title=training.title if training is not None else None,
        finding_type=item.finding_type,
        confidence=item.confidence,
        reasoning_summary=item.reasoning_summary,
        recommended_action=item.recommended_action,
        status=item.status,
        created_at=item.created_at,
    )


def _analysis_run_out(item: IncidentAnalysisRun) -> IncidentAnalysisRunOut:
    return IncidentAnalysisRunOut(
        id=item.id,
        incident_id=item.incident_id,
        source=item.source,
        analysis_summary=item.analysis_summary,
        resolution_summary=item.resolution_summary,
        created_at=item.created_at,
        findings=[_finding_out(finding) for finding in item.findings],
        related_matches=[
            IncidentRelatedMatchOut(
                id=match.id,
                related_incident_id=match.related_incident_id,
                related_incident_description=match.related_incident.description,
                related_analysis_run_id=match.related_analysis_run_id,
                related_analysis_summary=(
                    match.related_analysis_run.analysis_summary if getattr(match, "related_analysis_run", None) else None
                ),
                related_resolution_summary=(
                    match.related_analysis_run.resolution_summary if getattr(match, "related_analysis_run", None) else None
                ),
                related_findings=[
                    _finding_out(finding)
                    for finding in (
                        match.related_analysis_run.findings if getattr(match, "related_analysis_run", None) else []
                    )
                ],
                similarity_score=match.similarity_score,
                rationale=match.rationale,
            )
            for match in item.related_matches
        ],
    )


async def _validate_analysis_run_payload(payload: IncidentAnalysisRunCreate | IncidentAnalysisRunUpdate, db: AsyncSession) -> None:
    version_ids = {finding.procedure_version_id for finding in payload.findings if finding.procedure_version_id is not None}
    if not version_ids:
        return

    rows = list(
        (
            await db.execute(select(ProcedureVersion.id).where(ProcedureVersion.id.in_(version_ids)))
        )
        .scalars()
        .all()
    )
    missing = version_ids - set(rows)
    if missing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Procedure version not found")


def _apply_incident_status_change(incident: Incident, next_status: str, current_user: User) -> None:
    if next_status == incident.status:
        return
    incident.status = next_status
    if next_status == "closed":
        incident.closed_at = datetime.now(timezone.utc)
        incident.closed_by = current_user.id
        return
    incident.closed_at = None
    incident.closed_by = None


def _default_action_for_type(finding_type: str) -> str:
    if finding_type == "not_followed":
        return "Verificar cumplimiento operativo y reforzar el entrenamiento asociado."
    if finding_type == "needs_redefinition":
        return "Revisar el procedimiento y crear una nueva version con pasos y controles mas claros."
    if finding_type == "missing_procedure":
        return "Disenar y documentar un procedimiento nuevo para cubrir este escenario."
    return "Validar el rol de este procedimiento en el incidente y definir la remediacion mas adecuada."


def _contains_any(text: str, fragments: tuple[str, ...]) -> bool:
    lowered = text.lower()
    return any(fragment in lowered for fragment in fragments)


def _dominant_precedent_finding_type(precedent_findings: list[tuple[dict, IncidentAnalysisFinding]]) -> str | None:
    prioritized = [finding.finding_type for _related, finding in precedent_findings if finding.finding_type != "contributing_factor"]
    if prioritized:
        return prioritized[0]
    if precedent_findings:
        return precedent_findings[0][1].finding_type
    return None


def _infer_finding_type_for_match(
    incident: Incident,
    match: dict,
    precedent_findings: list[tuple[dict, IncidentAnalysisFinding]],
) -> str:
    precedent_type = _dominant_precedent_finding_type(precedent_findings)
    if precedent_type in {"not_followed", "needs_redefinition", "missing_procedure"}:
        return precedent_type

    description = incident.description or ""
    if _contains_any(description, INCIDENT_REDEFINITION_HINTS):
        return "needs_redefinition"

    if match.get("step_title") or match.get("reference_segment_range") or match.get("reference_quote"):
        return "not_followed"

    if (match.get("score") or 0) >= 0.72:
        return "needs_redefinition"

    return "not_followed"


def _finding_payload_to_model(payload, source: str) -> IncidentAnalysisFinding:
    return IncidentAnalysisFinding(
        procedure_version_id=payload.procedure_version_id,
        finding_type=payload.finding_type,
        confidence=payload.confidence,
        reasoning_summary=payload.reasoning_summary,
        recommended_action=payload.recommended_action or _default_action_for_type(payload.finding_type),
        status=payload.status or ("confirmed" if source == "manual" else "suggested"),
    )


@router.post("", response_model=IncidentOut, status_code=status.HTTP_201_CREATED)
async def create_incident(
    payload: IncidentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    embedding = await get_embedding(payload.description)
    if payload.role_id:
        role = (await db.execute(select(Role).where(Role.id == payload.role_id))).scalar_one_or_none()
        if role is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

    incident = Incident(
        description=payload.description,
        severity=payload.severity,
        status="open",
        role_id=payload.role_id,
        location=payload.location,
        created_by=current_user.id,
        embedding=embedding,
    )
    db.add(incident)
    await db.commit()
    result = await db.execute(select(Incident).where(Incident.id == incident.id).options(selectinload(Incident.role)))
    incident = result.scalar_one()
    return _incident_out(incident)


@router.get("", response_model=list[IncidentOut])
async def list_incidents(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Incident).order_by(Incident.created_at.desc()).options(selectinload(Incident.role)))
    return [_incident_out(item) for item in result.scalars().all()]


@router.get("/{incident_id}", response_model=IncidentOut)
async def get_incident(incident_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    incident = (
        await db.execute(select(Incident).where(Incident.id == incident_id).options(selectinload(Incident.role)))
    ).scalar_one_or_none()
    if incident is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    return _incident_out(incident)


@router.patch("/{incident_id}", response_model=IncidentOut)
async def update_incident(
    incident_id: uuid.UUID,
    payload: IncidentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    incident = (await db.execute(select(Incident).where(Incident.id == incident_id))).scalar_one_or_none()
    if incident is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    changes = payload.model_dump(exclude_unset=True)
    if "role_id" in changes and changes["role_id"] is not None:
        role = (await db.execute(select(Role).where(Role.id == changes["role_id"]))).scalar_one_or_none()
        if role is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

    for field, value in changes.items():
        if field == "status":
            _apply_incident_status_change(incident, value, current_user)
            continue
        setattr(incident, field, value)

    if "description" in changes and changes["description"]:
        incident.embedding = await get_embedding(changes["description"])

    await db.commit()
    incident = (
        await db.execute(select(Incident).where(Incident.id == incident_id).options(selectinload(Incident.role)))
    ).scalar_one()
    return _incident_out(incident)


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

    matches = await rank_procedure_versions_by_embedding(incident.embedding, limit=10, db=db, min_score=0.5)
    return [
        TrainingSuggestion(
            procedure_id=match["procedure_id"],
            procedure_version_id=match["procedure_version_id"],
            training_id=match["training_id"],
            title=(
                match["training_title"]
                or f"{match['procedure_code']} · {match['procedure_title']} · v{match['version_number']}"
            ),
            score=match["score"],
            snippet=match["snippet"][:200],
        )
        for match in matches
    ]


@router.get("/{incident_id}/analysis-runs", response_model=list[IncidentAnalysisRunOut])
async def get_incident_analysis_runs(incident_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    rows = list(
        (
            await db.execute(
                _analysis_run_query()
                .where(IncidentAnalysisRun.incident_id == incident_id)
                .order_by(IncidentAnalysisRun.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [_analysis_run_out(row) for row in rows]


@router.post(
    "/{incident_id}/analysis-runs",
    response_model=IncidentAnalysisRunOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_incident_analysis_run(
    incident_id: uuid.UUID,
    payload: IncidentAnalysisRunCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    incident = (await db.execute(select(Incident).where(Incident.id == incident_id))).scalar_one_or_none()
    if incident is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    if incident.status == "closed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Closed incidents cannot receive new analysis runs")
    await _validate_analysis_run_payload(payload, db)

    run = IncidentAnalysisRun(
        incident_id=incident_id,
        source="manual",
        analysis_summary=payload.analysis_summary,
        resolution_summary=payload.resolution_summary,
        created_by=current_user.id,
    )
    run.findings = [_finding_payload_to_model(finding, source="manual") for finding in payload.findings]
    db.add(run)
    await db.commit()
    run = (
        await db.execute(_analysis_run_query().where(IncidentAnalysisRun.id == run.id))
    ).scalar_one()
    return _analysis_run_out(run)


@router.patch(
    "/{incident_id}/analysis-runs/{run_id}",
    response_model=IncidentAnalysisRunOut,
)
async def update_incident_analysis_run(
    incident_id: uuid.UUID,
    run_id: uuid.UUID,
    payload: IncidentAnalysisRunUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = (
        await db.execute(
            select(IncidentAnalysisRun).where(
                IncidentAnalysisRun.id == run_id,
                IncidentAnalysisRun.incident_id == incident_id,
            )
        )
    ).scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident analysis run not found")
    incident = (await db.execute(select(Incident).where(Incident.id == incident_id))).scalar_one_or_none()
    if incident is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    if incident.status == "closed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Closed incidents cannot be edited")

    await _validate_analysis_run_payload(payload, db)
    run.analysis_summary = payload.analysis_summary
    run.resolution_summary = payload.resolution_summary
    run.findings = [_finding_payload_to_model(finding, source=run.source) for finding in payload.findings]
    await db.commit()
    run = (
        await db.execute(_analysis_run_query().where(IncidentAnalysisRun.id == run.id))
    ).scalar_one()
    return _analysis_run_out(run)


@router.post(
    "/{incident_id}/analyze-procedures",
    response_model=IncidentAnalysisRunOut,
    status_code=status.HTTP_201_CREATED,
)
async def analyze_incident_procedures(
    incident_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    incident = (await db.execute(select(Incident).where(Incident.id == incident_id))).scalar_one_or_none()
    if incident is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    if incident.embedding is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incident has no embedding")
    if incident.status == "closed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Closed incidents cannot be analyzed")

    related_incidents = await get_similar_incident_analysis_runs(incident_id, incident.embedding, db=db)
    matches = await rank_procedure_versions_by_embedding(incident.embedding, limit=5, db=db, min_score=0.5)

    created_run = IncidentAnalysisRun(
        incident_id=incident_id,
        source="ai",
        analysis_summary=(
            f"Analisis IA con {len(matches)} coincidencias semanticas y {len(related_incidents)} precedentes reutilizados."
        ),
        resolution_summary=(
            "Se generaron hallazgos sugeridos para revisar cumplimiento, redefinicion o vacios procedimentales."
        ),
        created_by=current_user.id,
    )
    db.add(created_run)
    await db.flush()

    findings: list[IncidentAnalysisFinding] = []
    used_procedure_versions: set[uuid.UUID] = set()
    reused_missing_memory: set[tuple[str, str, str]] = set()

    for match in matches:
        procedure_version_id = match["procedure_version_id"]
        if procedure_version_id in used_procedure_versions:
            continue
        used_procedure_versions.add(procedure_version_id)

        precedent_findings: list[tuple[dict, IncidentAnalysisFinding]] = []
        for related in related_incidents:
            for prior_finding in related["analysis_run"].findings:
                if prior_finding.procedure_version_id == procedure_version_id:
                    precedent_findings.append((related, prior_finding))

        reasoning_summary = (
            "Coincidencia semántica entre la descripción del incidente y el procedimiento versionado. "
            f"{f'Paso relevante: {match['step_title']}. ' if match.get('step_title') else ''}"
            f"Fragmento relevante: {match['snippet']}"
        )
        finding_type = _infer_finding_type_for_match(incident, match, precedent_findings)
        recommended_action = _default_action_for_type(finding_type)
        confidence = match["score"]

        if precedent_findings:
            precedent_context = " ".join(
                f"{build_incident_analysis_context(related)}. Hallazgo relacionado: {build_finding_memory_line(prior_finding)}."
                for related, prior_finding in precedent_findings[:2]
            )
            reasoning_summary = f"{reasoning_summary} {precedent_context}"
            dominant_finding = precedent_findings[0][1]
            finding_type = _infer_finding_type_for_match(incident, match, precedent_findings)
            recommended_action = dominant_finding.recommended_action or _default_action_for_type(finding_type)
            confidence = max(confidence or 0, dominant_finding.confidence or 0, 0.6)

        findings.append(
            IncidentAnalysisFinding(
                analysis_run_id=created_run.id,
                procedure_version_id=procedure_version_id,
                finding_type=finding_type,
                confidence=min(confidence, 0.99) if confidence is not None else None,
                reasoning_summary=reasoning_summary,
                recommended_action=recommended_action,
                status="suggested",
            )
        )

    for related in related_incidents:
        for prior_finding in related["analysis_run"].findings:
            if prior_finding.finding_type != "missing_procedure" or prior_finding.procedure_version_id is not None:
                continue
            key = (
                prior_finding.finding_type,
                prior_finding.reasoning_summary or "",
                prior_finding.recommended_action or "",
            )
            if key in reused_missing_memory:
                continue
            reused_missing_memory.add(key)
            findings.append(
                IncidentAnalysisFinding(
                    analysis_run_id=created_run.id,
                    procedure_version_id=None,
                    finding_type="missing_procedure",
                    confidence=min(related["similarity_score"], 0.95),
                    reasoning_summary=(
                        "Un incidente similar previo sugirio un vacio procedimental comparable. "
                        f"{build_incident_analysis_context(related)}"
                    ),
                    recommended_action=prior_finding.recommended_action or _default_action_for_type("missing_procedure"),
                    status="suggested",
                )
            )

    should_add_gap_finding = not findings or _contains_any(incident.description or "", INCIDENT_GAP_HINTS)

    if should_add_gap_finding:
        findings.append(
            IncidentAnalysisFinding(
                analysis_run_id=created_run.id,
                procedure_version_id=None,
                finding_type="missing_procedure",
                confidence=0.45,
                reasoning_summary=(
                    "No se encontro un procedimiento versionado con evidencia suficiente; podria existir un vacio "
                    "procedimental o un control aun no estandarizado."
                ),
                recommended_action=_default_action_for_type("missing_procedure"),
                status="suggested",
            )
        )

    db.add_all(findings)

    for related in related_incidents:
        db.add(
            IncidentRelatedMatch(
                analysis_run_id=created_run.id,
                related_incident_id=related["incident_id"],
                related_analysis_run_id=related["analysis_run"].id,
                similarity_score=related["similarity_score"],
                rationale="Precedente reutilizado para enriquecer los hallazgos del nuevo analisis.",
            )
        )

    await db.commit()
    created_run = (
        await db.execute(_analysis_run_query().where(IncidentAnalysisRun.id == created_run.id))
    ).scalar_one()
    return _analysis_run_out(created_run)


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

    duplicate = (
        await db.execute(
            select(IncidentTrainingLink).where(
                IncidentTrainingLink.incident_id == incident_id,
                IncidentTrainingLink.training_id == payload.training_id,
            )
        )
    ).scalar_one_or_none()
    if duplicate:
        return {"detail": "Training linked to incident"}

    link = IncidentTrainingLink(
        incident_id=incident_id,
        training_id=payload.training_id,
        source=payload.source,
    )
    db.add(link)
    await db.commit()
    return {"detail": "Training linked to incident"}
