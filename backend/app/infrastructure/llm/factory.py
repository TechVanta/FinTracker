from app.domain.enums import LLMProviderType
from app.infrastructure.llm.base import LLMProvider
from app.infrastructure.llm.grok_provider import GrokProvider
from app.infrastructure.llm.openai_provider import OpenAIProvider

_PROVIDERS: dict[str, type[LLMProvider]] = {
    LLMProviderType.GROK.value: GrokProvider,
    LLMProviderType.OPENAI.value: OpenAIProvider,
}


def get_llm_provider(provider_name: str, api_key: str) -> LLMProvider:
    provider_cls = _PROVIDERS.get(provider_name.lower())
    if provider_cls is None:
        raise ValueError(
            f"Unknown LLM provider: {provider_name}. "
            f"Available: {list(_PROVIDERS.keys())}"
        )
    return provider_cls(api_key=api_key)
