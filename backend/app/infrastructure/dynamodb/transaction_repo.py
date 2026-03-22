import logging
from decimal import Decimal

from boto3.dynamodb.conditions import Key, Attr

from app.config import get_settings
from app.domain.entities import Transaction
from app.infrastructure.dynamodb.client import get_table

logger = logging.getLogger(__name__)


def _convert_floats(item: dict) -> dict:
    """DynamoDB requires Decimal instead of float."""
    converted = {}
    for k, v in item.items():
        if isinstance(v, float):
            converted[k] = Decimal(str(v))
        else:
            converted[k] = v
    return converted


def _convert_decimals(item: dict) -> dict:
    """Convert Decimal back to float for Pydantic."""
    converted = {}
    for k, v in item.items():
        if isinstance(v, Decimal):
            converted[k] = float(v)
        else:
            converted[k] = v
    return converted


class TransactionRepository:
    def __init__(self):
        self._table = get_table(get_settings().DYNAMODB_TRANSACTIONS_TABLE)

    def create_batch(self, transactions: list[Transaction]) -> None:
        with self._table.batch_writer() as batch:
            for txn in transactions:
                batch.put_item(Item=_convert_floats(txn.model_dump()))
        logger.info("Batch created %d transactions", len(transactions))

    def get_by_user(
        self,
        user_id: str,
        start_date: str | None = None,
        end_date: str | None = None,
        category: str | None = None,
    ) -> list[Transaction]:
        key_condition = Key("user_id").eq(user_id)
        if start_date and end_date:
            key_condition &= Key("date").between(start_date, end_date)
        elif start_date:
            key_condition &= Key("date").gte(start_date)
        elif end_date:
            key_condition &= Key("date").lte(end_date)

        kwargs = {
            "IndexName": "UserDateIndex",
            "KeyConditionExpression": key_condition,
        }

        if category:
            kwargs["FilterExpression"] = Attr("category").eq(category)

        items = []
        while True:
            response = self._table.query(**kwargs)
            items.extend(response.get("Items", []))
            if "LastEvaluatedKey" not in response:
                break
            kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]

        return [Transaction(**_convert_decimals(item)) for item in items]

    def update(self, transaction_id: str, updates: dict) -> Transaction | None:
        update_expr_parts = []
        expr_values = {}
        expr_names = {}

        for i, (key, value) in enumerate(updates.items()):
            placeholder_name = f"#attr{i}"
            placeholder_value = f":val{i}"
            update_expr_parts.append(f"{placeholder_name} = {placeholder_value}")
            expr_names[placeholder_name] = key
            expr_values[placeholder_value] = Decimal(str(value)) if isinstance(value, float) else value

        response = self._table.update_item(
            Key={"transaction_id": transaction_id},
            UpdateExpression="SET " + ", ".join(update_expr_parts),
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values,
            ReturnValues="ALL_NEW",
        )
        item = response.get("Attributes")
        return Transaction(**_convert_decimals(item)) if item else None

    def delete(self, transaction_id: str) -> None:
        self._table.delete_item(Key={"transaction_id": transaction_id})
