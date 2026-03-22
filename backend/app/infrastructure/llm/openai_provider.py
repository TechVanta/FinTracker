import json
import logging

import httpx

from app.domain.enums import TransactionCategory
from app.infrastructure.llm.base import LLMProvider

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a financial transaction categorizer. Given a list of transaction descriptions, categorize each one into exactly one of these categories:
["Food", "Travel", "Groceries", "Bills", "Shopping", "Entertainment", "Other"]

Respond ONLY with a JSON array of category strings in the same order as the input.
Example input: ["UBER TRIP", "NETFLIX SUBSCRIPTION", "WALMART GROCERY"]
Example output: ["Travel", "Entertainment", "Groceries"]"""


class OpenAIProvider(LLMProvider):
    """OpenAI LLM provider for transaction categorization."""

    BASE_URL = "https://api.openai.com/v1"

    def __init__(self, api_key: str):
        self._api_key = api_key

    async def categorize(self, descriptions: list[str]) -> list[TransactionCategory]:
        prompt = json.dumps(descriptions)

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0,
                    "response_format": {"type": "json_object"},
                },
            )
            response.raise_for_status()
            data = response.json()

        content = data["choices"][0]["message"]["content"]
        parsed = json.loads(content)

        # Handle both direct array and wrapped object responses
        if isinstance(parsed, list):
            categories = parsed
        elif isinstance(parsed, dict):
            categories = list(parsed.values())[0] if parsed else []
        else:
            categories = []

        valid_values = {c.value for c in TransactionCategory}
        result = []
        for cat in categories:
            if cat in valid_values:
                result.append(TransactionCategory(cat))
            else:
                result.append(TransactionCategory.OTHER)

        if len(result) != len(descriptions):
            logger.warning(
                "LLM returned %d categories for %d descriptions",
                len(result),
                len(descriptions),
            )
            while len(result) < len(descriptions):
                result.append(TransactionCategory.OTHER)
            result = result[: len(descriptions)]

        return result
