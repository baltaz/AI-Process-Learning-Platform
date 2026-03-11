from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.upload import PresignRequest, PresignResponse
from app.services.storage_service import generate_presigned_url

router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.post("/presign", response_model=PresignResponse)
async def presign_upload(
    payload: PresignRequest,
    current_user: User = Depends(get_current_user),
):
    presigned_url, storage_key = await generate_presigned_url(
        filename=payload.filename,
        content_type=payload.content_type,
    )
    return PresignResponse(presigned_url=presigned_url, storage_key=storage_key)
