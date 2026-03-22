import logging

from app.domain.enums import TransactionCategory
from app.infrastructure.llm.base import LLMProvider
from app.services.extraction_service import RawTransaction

logger = logging.getLogger(__name__)

# Rule-based fallback keyword mapping
CATEGORY_RULES: dict[TransactionCategory, list[str]] = {
    TransactionCategory.FOOD: [
        "restaurant", "mcdonald", "starbucks", "uber eats", "doordash",
        "pizza", "burger", "cafe", "diner", "sushi", "subway", "chipotle",
        "grubhub", "postmates", "kfc", "wendy", "taco bell",
    ],
    TransactionCategory.TRAVEL: [
        "uber", "lyft", "airline", "flight", "hotel", "airbnb",
        "gas station", "shell", "parking", "transit", "taxi",
        "expedia", "booking.com", "rental car",
    ],
    TransactionCategory.GROCERIES: [
        "walmart", "costco", "trader joe", "whole foods", "kroger",
        "safeway", "supermarket", "grocery", "market", "aldi",
        "publix", "wegmans", "target",
    ],
    TransactionCategory.BILLS: [
        "electric", "hydro", "internet", "phone", "insurance",
        "rent", "mortgage", "water", "utility", "cable", "verizon",
        "at&t", "t-mobile", "comcast", "spectrum",
    ],
    TransactionCategory.SHOPPING: [
        "amazon", "best buy", "apple store", "nike", "zara",
        "h&m", "nordstrom", "ebay", "etsy", "shopify", "mall",
    ],
    TransactionCategory.ENTERTAINMENT: [
        "netflix", "spotify", "hulu", "disney+", "cinema", "theatre",
        "game", "steam", "playstation", "xbox", "concert", "ticket",
        "youtube", "twitch", "hbo",
    ],
}


def _rule_based_categorize(description: str) -> TransactionCategory:
    """Categorize a transaction using keyword matching."""
    desc_lower = description.lower()
    for category, keywords in CATEGORY_RULES.items():
        if any(keyword in desc_lower for keyword in keywords):
            return category
    return TransactionCategory.OTHER


class CategorizationService:
    """Categorizes transactions using LLM with rule-based fallback."""

    def __init__(self, llm_provider: LLMProvider | None = None):
        self._llm = llm_provider

    async def categorize(
        self, transactions: list[RawTransaction]
    ) -> list[TransactionCategory]:
        if not transactions:
            return []

        descriptions = [t.description for t in transactions]

        # Try LLM first
        if self._llm:
            try:
                categories = await self._llm.categorize(descriptions)
                logger.info("LLM categorized %d transactions", len(categories))
                return categories
            except Exception as e:
                logger.warning("LLM categorization failed, falling back to rules: %s", e)

        # Rule-based fallback
        categories = [_rule_based_categorize(desc) for desc in descriptions]
        logger.info("Rule-based categorized %d transactions", len(categories))
        return categories
