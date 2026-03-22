import boto3
from functools import lru_cache

from app.config import get_settings


@lru_cache
def get_dynamodb_resource():
    settings = get_settings()
    return boto3.resource("dynamodb", region_name=settings.AWS_REGION)


def get_table(table_name: str):
    return get_dynamodb_resource().Table(table_name)
