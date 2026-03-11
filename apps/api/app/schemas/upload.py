from pydantic import BaseModel


class PresignRequest(BaseModel):
    filename: str
    content_type: str = "video/mp4"


class PresignResponse(BaseModel):
    presigned_url: str
    storage_key: str
