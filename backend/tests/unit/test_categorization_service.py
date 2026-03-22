import pytest

from app.domain.enums import TransactionCategory
from app.infrastructure.llm.base import LLMProvider
from app.services.categorization_service import CategorizationService, _rule_based_categorize
from app.services.extraction_service import RawTransaction


class MockLLMProvider(LLMProvider):
    """Mock LLM that returns predetermined categories."""

    def __init__(self, categories: list[TransactionCategory]):
        self._categories = categories

    async def categorize(self, descriptions: list[str]) -> list[TransactionCategory]:
        return self._categories[: len(descriptions)]


class FailingLLMProvider(LLMProvider):
    """Mock LLM that always fails."""

    async def categorize(self, descriptions: list[str]) -> list[TransactionCategory]:
        raise RuntimeError("LLM service unavailable")


class TestRuleBasedCategorization:
    def test_food_keywords(self):
        assert _rule_based_categorize("STARBUCKS COFFEE") == TransactionCategory.FOOD
        assert _rule_based_categorize("MCDONALD'S #1234") == TransactionCategory.FOOD

    def test_travel_keywords(self):
        assert _rule_based_categorize("UBER TRIP") == TransactionCategory.TRAVEL
        assert _rule_based_categorize("SHELL GAS STATION") == TransactionCategory.TRAVEL

    def test_groceries_keywords(self):
        assert _rule_based_categorize("WALMART SUPERCENTER") == TransactionCategory.GROCERIES
        assert _rule_based_categorize("COSTCO WHOLESALE") == TransactionCategory.GROCERIES

    def test_bills_keywords(self):
        assert _rule_based_categorize("VERIZON WIRELESS") == TransactionCategory.BILLS
        assert _rule_based_categorize("ELECTRIC UTILITY CO") == TransactionCategory.BILLS

    def test_shopping_keywords(self):
        assert _rule_based_categorize("AMAZON.COM") == TransactionCategory.SHOPPING
        assert _rule_based_categorize("BEST BUY #456") == TransactionCategory.SHOPPING

    def test_entertainment_keywords(self):
        assert _rule_based_categorize("NETFLIX.COM") == TransactionCategory.ENTERTAINMENT
        assert _rule_based_categorize("SPOTIFY PREMIUM") == TransactionCategory.ENTERTAINMENT

    def test_unknown_returns_other(self):
        assert _rule_based_categorize("RANDOM COMPANY XYZ") == TransactionCategory.OTHER


@pytest.mark.asyncio
class TestCategorizationService:
    async def test_uses_llm_when_available(self):
        mock_llm = MockLLMProvider([TransactionCategory.FOOD, TransactionCategory.TRAVEL])
        service = CategorizationService(llm_provider=mock_llm)

        transactions = [
            RawTransaction(date="2024-01-15", description="SOME PLACE", amount=10.0),
            RawTransaction(date="2024-01-16", description="OTHER PLACE", amount=20.0),
        ]
        categories = await service.categorize(transactions)
        assert categories == [TransactionCategory.FOOD, TransactionCategory.TRAVEL]

    async def test_falls_back_to_rules_on_llm_failure(self):
        failing_llm = FailingLLMProvider()
        service = CategorizationService(llm_provider=failing_llm)

        transactions = [
            RawTransaction(date="2024-01-15", description="STARBUCKS COFFEE", amount=4.50),
        ]
        categories = await service.categorize(transactions)
        assert categories == [TransactionCategory.FOOD]

    async def test_uses_rules_when_no_llm(self):
        service = CategorizationService(llm_provider=None)

        transactions = [
            RawTransaction(date="2024-01-15", description="NETFLIX.COM", amount=15.99),
        ]
        categories = await service.categorize(transactions)
        assert categories == [TransactionCategory.ENTERTAINMENT]

    async def test_empty_transactions(self):
        service = CategorizationService(llm_provider=None)
        categories = await service.categorize([])
        assert categories == []
