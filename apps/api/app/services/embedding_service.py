from app.services.ai.provider_factory import get_ai_provider


async def get_embedding(text: str) -> list[float]:
    provider = get_ai_provider()
    return await provider.embed_text(text)
