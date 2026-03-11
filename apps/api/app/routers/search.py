from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.search import SearchResult
from app.services.search_service import semantic_search

router = APIRouter(prefix="/trainings", tags=["search"])


@router.get("/search", response_model=list[SearchResult])
async def search_trainings(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    results = await semantic_search(q, limit=limit, db=db)
    return results
