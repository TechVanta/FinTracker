import logging

from app.domain.entities import Transaction
from app.domain.enums import TransactionCategory
from app.domain.exceptions import NotFoundError
from app.infrastructure.dynamodb.transaction_repo import TransactionRepository

logger = logging.getLogger(__name__)


class TransactionService:
    def __init__(self, transaction_repo: TransactionRepository):
        self._repo = transaction_repo

    def get_transactions(
        self,
        user_id: str,
        start_date: str | None = None,
        end_date: str | None = None,
        category: str | None = None,
    ) -> list[Transaction]:
        return self._repo.get_by_user(
            user_id=user_id,
            start_date=start_date,
            end_date=end_date,
            category=category,
        )

    def update_category(
        self, transaction_id: str, category: TransactionCategory
    ) -> Transaction:
        updated = self._repo.update(
            transaction_id=transaction_id,
            updates={"category": category.value},
        )
        if not updated:
            raise NotFoundError("Transaction", transaction_id)
        logger.info("Updated transaction %s category to %s", transaction_id, category.value)
        return updated
