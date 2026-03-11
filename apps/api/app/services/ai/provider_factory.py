from app.core.config import settings
from app.services.ai.providers.base import AIProvider
from app.services.ai.providers.gemini_provider import GeminiProvider
from app.services.ai.providers.openai_provider import OpenAIProvider

_provider: AIProvider | None = None


def get_ai_provider() -> AIProvider:
    global _provider
    if _provider is not None:
        return _provider

    profile = settings.AI_PROFILE.upper()
    if profile == "PAID":
        _provider = OpenAIProvider()
        return _provider
    if profile == "FREE":
        _provider = GeminiProvider()
        return _provider

    raise ValueError(f"Unsupported AI_PROFILE '{settings.AI_PROFILE}'")
