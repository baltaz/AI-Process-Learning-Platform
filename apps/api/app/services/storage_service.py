import uuid

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import settings


def _get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY_ID,
        aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


async def generate_presigned_url(filename: str, content_type: str) -> tuple[str, str]:
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "mp4"
    storage_key = f"uploads/{uuid.uuid4()}.{ext}"

    client = _get_s3_client()
    presigned_url = client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.S3_BUCKET_NAME,
            "Key": storage_key,
            "ContentType": content_type,
        },
        ExpiresIn=3600,
    )

    return presigned_url, storage_key


async def download_file(storage_key: str, local_path: str):
    client = _get_s3_client()
    client.download_file(settings.S3_BUCKET_NAME, storage_key, local_path)


async def storage_key_exists(storage_key: str) -> bool:
    client = _get_s3_client()
    try:
        client.head_object(Bucket=settings.S3_BUCKET_NAME, Key=storage_key)
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code in {"404", "NoSuchKey", "NotFound"}:
            return False
        raise
    return True


async def upload_file(local_path: str, storage_key: str, content_type: str = "image/jpeg"):
    client = _get_s3_client()
    client.upload_file(
        local_path,
        settings.S3_BUCKET_NAME,
        storage_key,
        ExtraArgs={"ContentType": content_type},
    )
