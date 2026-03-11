import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.semantic_segment import SemanticSegment
from app.models.training import Training
from app.schemas.search import SearchResult
from app.services.embedding_service import get_embedding


async def semantic_search(query: str, limit: int, db: AsyncSession) -> list[SearchResult]:
    query_embedding = await get_embedding(query)

    stmt = (
        select(
            SemanticSegment.training_id,
            SemanticSegment.text_fused,
            SemanticSegment.start_time,
            SemanticSegment.end_time,
            SemanticSegment.embedding.cosine_distance(query_embedding).label("distance"),
        )
        .where(SemanticSegment.embedding.isnot(None))
        .order_by("distance")
        .limit(limit * 3)
    )
    result = await db.execute(stmt)
    rows = result.all()

    seen: set[uuid.UUID] = set()
    results: list[SearchResult] = []

    for row in rows:
        if row.training_id in seen:
            continue
        seen.add(row.training_id)

        t_result = await db.execute(select(Training).where(Training.id == row.training_id))
        training = t_result.scalar_one_or_none()
        if not training:
            continue

        results.append(
            SearchResult(
                training_id=row.training_id,
                training_title=training.title,
                snippet=row.text_fused[:300],
                start_time=row.start_time,
                end_time=row.end_time,
                score=round(1 - row.distance, 4),
            )
        )

        if len(results) >= limit:
            break

    return results
