from abc import ABC, abstractmethod

from app.domain.enums import TransactionCategory


class LLMProvider(ABC):
    """Abstract interface for LLM-based transaction categorization."""

    @abstractmethod
    async def categorize(self, descriptions: list[str]) -> list[TransactionCategory]:
        """Categorize a list of transaction descriptions.

        Args:
            descriptions: List of transaction description strings.

        Returns:
            List of TransactionCategory values, one per description.
        """
        ...
