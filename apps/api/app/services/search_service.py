from sqlalchemy import and_, func, select
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.procedure import Procedure, ProcedureStepIndex, ProcedureVersion
from app.models.semantic_segment import SemanticSegment
from app.models.training import Training
from app.schemas.search import SearchResult
from app.services.embedding_service import get_embedding


def _build_step_match(row, score: float) -> dict:
    reference = row.reference_json if isinstance(row.reference_json, dict) else {}
    snippet = (
        reference.get("quote")
        or row.description
        or row.search_text
    )
    return {
        "procedure_version_id": row.procedure_version_id,
        "snippet": str(snippet or "")[:300],
        "step_index": row.step_index,
        "step_title": row.title,
        "reference_segment_range": reference.get("segment_range"),
        "reference_quote": reference.get("quote"),
        "match_source": "step_index",
        "start_time": None,
        "end_time": None,
        "score": score,
    }


def _build_segment_match(row, score: float) -> dict:
    return {
        "procedure_version_id": row.procedure_version_id,
        "snippet": row.text_fused[:300],
        "step_index": None,
        "step_title": None,
        "reference_segment_range": None,
        "reference_quote": None,
        "match_source": "semantic_segment",
        "start_time": row.start_time,
        "end_time": row.end_time,
        "score": score,
    }


def _latest_procedure_versions_subquery():
    latest_version_numbers = (
        select(
            ProcedureVersion.procedure_id.label("procedure_id"),
            func.max(ProcedureVersion.version_number).label("version_number"),
        )
        .group_by(ProcedureVersion.procedure_id)
        .subquery()
    )
    return (
        select(ProcedureVersion.id.label("id"))
        .join(
            latest_version_numbers,
            and_(
                ProcedureVersion.procedure_id == latest_version_numbers.c.procedure_id,
                ProcedureVersion.version_number == latest_version_numbers.c.version_number,
            ),
        )
        .subquery()
    )


async def rank_procedure_versions_by_embedding(
    query_embedding: list[float],
    limit: int,
    db: AsyncSession,
    min_score: float = 0.0,
) -> list[dict]:
    latest_versions = _latest_procedure_versions_subquery()
    candidate_matches: list[tuple[int, float, dict]] = []

    step_stmt = (
        select(
            ProcedureStepIndex.procedure_version_id,
            ProcedureStepIndex.step_index,
            ProcedureStepIndex.title,
            ProcedureStepIndex.description,
            ProcedureStepIndex.reference_json,
            ProcedureStepIndex.search_text,
            ProcedureStepIndex.embedding.cosine_distance(query_embedding).label("distance"),
        )
        .where(
            ProcedureStepIndex.embedding.isnot(None),
            ProcedureStepIndex.procedure_version_id.in_(select(latest_versions.c.id)),
        )
        .order_by("distance")
        .limit(limit * 5)
    )
    try:
        step_rows = (await db.execute(step_stmt)).all()
    except ProgrammingError:
        # Some local environments may not have the optional step index table yet.
        # In that case, keep the analysis available using semantic segments only.
        step_rows = []
    for index, row in enumerate(step_rows):
        score = round(1 - float(row.distance or 1), 4)
        if score < min_score:
            continue
        candidate_matches.append((index, score, _build_step_match(row, score)))

    segment_stmt = (
        select(
            SemanticSegment.procedure_version_id,
            SemanticSegment.text_fused,
            SemanticSegment.start_time,
            SemanticSegment.end_time,
            SemanticSegment.embedding.cosine_distance(query_embedding).label("distance"),
        )
        .where(
            SemanticSegment.embedding.isnot(None),
            SemanticSegment.procedure_version_id.in_(select(latest_versions.c.id)),
        )
        .order_by("distance")
        .limit(limit * 5)
    )
    segment_rows = (await db.execute(segment_stmt)).all()
    step_candidate_count = len(candidate_matches)
    for index, row in enumerate(segment_rows, start=step_candidate_count):
        score = round(1 - float(row.distance or 1), 4)
        if score < min_score:
            continue
        candidate_matches.append((index, score, _build_segment_match(row, score)))

    best_match_by_version_id: dict = {}
    for order, score, match in candidate_matches:
        version_id = match["procedure_version_id"]
        current = best_match_by_version_id.get(version_id)
        if current is None or score > current["score"]:
            best_match_by_version_id[version_id] = {
                "order": order,
                "score": score,
                "match": match,
            }

    ranked_matches = sorted(
        best_match_by_version_id.values(),
        key=lambda item: (-item["score"], item["order"]),
    )[:limit]
    if not ranked_matches:
        return []
    ordered_version_ids = [item["match"]["procedure_version_id"] for item in ranked_matches]
    match_by_version_id = {item["match"]["procedure_version_id"]: item["match"] for item in ranked_matches}

    version_rows = (
        await db.execute(
            select(
                ProcedureVersion.id,
                ProcedureVersion.procedure_id,
                ProcedureVersion.version_number,
                Procedure.code,
                Procedure.title,
                Training.id.label("training_id"),
                Training.title.label("training_title"),
            )
            .join(Procedure, Procedure.id == ProcedureVersion.procedure_id)
            .outerjoin(Training, Training.procedure_version_id == ProcedureVersion.id)
            .where(ProcedureVersion.id.in_(ordered_version_ids))
        )
    ).all()
    version_by_id = {row.id: row for row in version_rows}

    results: list[dict] = []
    for version_id in ordered_version_ids:
        version = version_by_id.get(version_id)
        if version is None:
            continue
        match = match_by_version_id[version_id]
        results.append(
            {
                **match,
                "procedure_id": version.procedure_id,
                "procedure_code": version.code,
                "procedure_title": version.title,
                "version_number": version.version_number,
                "training_id": version.training_id,
                "training_title": version.training_title,
            }
        )
    return results


async def semantic_search(query: str, limit: int, db: AsyncSession) -> list[SearchResult]:
    query_embedding = await get_embedding(query)
    matches = await rank_procedure_versions_by_embedding(query_embedding, limit=limit, db=db, min_score=0.55)
    return [SearchResult(**match) for match in matches]
