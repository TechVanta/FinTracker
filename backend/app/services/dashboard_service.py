import logging
from collections import defaultdict

from app.domain.entities import DashboardSummary
from app.infrastructure.dynamodb.transaction_repo import TransactionRepository

logger = logging.getLogger(__name__)


class DashboardService:
    def __init__(self, transaction_repo: TransactionRepository):
        self._repo = transaction_repo

    def get_summary(
        self, user_id: str, month: int, year: int
    ) -> DashboardSummary:
        start_date = f"{year}-{month:02d}-01"
        if month == 12:
            end_date = f"{year + 1}-01-01"
        else:
            end_date = f"{year}-{month + 1:02d}-01"

        transactions = self._repo.get_by_user(
            user_id=user_id, start_date=start_date, end_date=end_date
        )

        total_spending = sum(t.amount for t in transactions)

        category_totals: dict[str, float] = defaultdict(float)
        daily_totals: dict[str, float] = defaultdict(float)

        for txn in transactions:
            category_totals[txn.category.value] += txn.amount
            daily_totals[txn.date] += txn.amount

        monthly_trend = [
            {"date": date, "amount": round(amount, 2)}
            for date, amount in sorted(daily_totals.items())
        ]

        return DashboardSummary(
            total_spending=round(total_spending, 2),
            category_breakdown={k: round(v, 2) for k, v in category_totals.items()},
            monthly_trend=monthly_trend,
            transaction_count=len(transactions),
        )
