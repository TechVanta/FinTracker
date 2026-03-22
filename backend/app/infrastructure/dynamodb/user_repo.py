import logging

from boto3.dynamodb.conditions import Key

from app.config import get_settings
from app.domain.entities import User
from app.infrastructure.dynamodb.client import get_table

logger = logging.getLogger(__name__)


class UserRepository:
    def __init__(self):
        self._table = get_table(get_settings().DYNAMODB_USERS_TABLE)

    def create(self, user: User) -> User:
        self._table.put_item(
            Item=user.model_dump(),
            ConditionExpression="attribute_not_exists(user_id)",
        )
        logger.info("Created user %s", user.user_id)
        return user

    def get_by_id(self, user_id: str) -> User | None:
        response = self._table.get_item(Key={"user_id": user_id})
        item = response.get("Item")
        return User(**item) if item else None

    def get_by_email(self, email: str) -> User | None:
        response = self._table.query(
            IndexName="EmailIndex",
            KeyConditionExpression=Key("email").eq(email),
        )
        items = response.get("Items", [])
        return User(**items[0]) if items else None
