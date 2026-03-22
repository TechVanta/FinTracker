import logging

import boto3
from botocore.config import Config

from app.config import get_settings

logger = logging.getLogger(__name__)


class S3StorageClient:
    def __init__(self):
        settings = get_settings()
        self._bucket = settings.S3_UPLOADS_BUCKET
        self._client = boto3.client(
            "s3",
            region_name=settings.AWS_REGION,
            config=Config(signature_version="s3v4"),
        )

    def generate_presigned_upload_url(
        self, key: str, content_type: str, expires_in: int = 3600
    ) -> str:
        url = self._client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self._bucket,
                "Key": key,
                "ContentType": content_type,
            },
            ExpiresIn=expires_in,
        )
        logger.info("Generated presigned upload URL for %s", key)
        return url

    def generate_presigned_download_url(self, key: str, expires_in: int = 3600) -> str:
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=expires_in,
        )

    def get_object(self, key: str) -> bytes:
        response = self._client.get_object(Bucket=self._bucket, Key=key)
        return response["Body"].read()

    def delete_object(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)
        logger.info("Deleted object %s", key)
