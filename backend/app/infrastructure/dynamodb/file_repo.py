import logging

from boto3.dynamodb.conditions import Key

from app.config import get_settings
from app.domain.entities import FileRecord
from app.domain.enums import FileStatus
from app.infrastructure.dynamodb.client import get_table

logger = logging.getLogger(__name__)


class FileRepository:
    def __init__(self):
        self._table = get_table(get_settings().DYNAMODB_FILES_TABLE)

    def create(self, file_record: FileRecord) -> FileRecord:
        self._table.put_item(Item=file_record.model_dump())
        logger.info("Created file record %s", file_record.file_id)
        return file_record

    def get_by_id(self, file_id: str) -> FileRecord | None:
        response = self._table.get_item(Key={"file_id": file_id})
        item = response.get("Item")
        return FileRecord(**item) if item else None

    def get_by_user(self, user_id: str) -> list[FileRecord]:
        items = []
        kwargs = {
            "IndexName": "UserIndex",
            "KeyConditionExpression": Key("user_id").eq(user_id),
        }
        while True:
            response = self._table.query(**kwargs)
            items.extend(response.get("Items", []))
            if "LastEvaluatedKey" not in response:
                break
            kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]

        return [FileRecord(**item) for item in items]

    def update_status(
        self, file_id: str, status: FileStatus, transaction_count: int = 0
    ) -> FileRecord | None:
        response = self._table.update_item(
            Key={"file_id": file_id},
            UpdateExpression="SET #s = :status, transaction_count = :count",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":status": status.value,
                ":count": transaction_count,
            },
            ReturnValues="ALL_NEW",
        )
        item = response.get("Attributes")
        return FileRecord(**item) if item else None
