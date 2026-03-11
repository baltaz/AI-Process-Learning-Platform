from abc import ABC, abstractmethod
from typing import Any


class AIProviderError(Exception):
    def __init__(self, message: str, code: str = "provider_error"):
        super().__init__(message)
        self.code = code


class AIProvider(ABC):
    @abstractmethod
    async def transcribe_video(self, video_path: str) -> list[dict]:
        raise NotImplementedError

    @abstractmethod
    async def embed_text(self, text: str) -> list[float]:
        raise NotImplementedError

    @abstractmethod
    async def caption_image_b64(self, image_b64: str, prompt: str) -> str:
        raise NotImplementedError

    @abstractmethod
    async def generate_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.3,
        response_schema: dict | None = None,
        schema_name: str = "structured_response",
    ) -> Any:
        raise NotImplementedError
