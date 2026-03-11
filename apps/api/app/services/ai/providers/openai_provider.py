import json
from typing import Any

from openai import APIError, AuthenticationError, AsyncOpenAI, RateLimitError

from app.core.config import settings
from app.services.ai.providers.base import AIProvider, AIProviderError
from app.services.ai.usage_tracking import record_ai_usage_event


class OpenAIProvider(AIProvider):
    def __init__(self) -> None:
        self._client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    @staticmethod
    def _price_from_tokens(input_tokens: int, output_tokens: int, input_price_1m: float, output_price_1m: float) -> float:
        return (input_tokens / 1_000_000) * input_price_1m + (output_tokens / 1_000_000) * output_price_1m

    async def transcribe_video(self, video_path: str) -> list[dict]:
        try:
            with open(video_path, "rb") as f:
                response = await self._client.audio.transcriptions.create(
                    model=settings.OPENAI_MODEL_TRANSCRIBE,
                    file=f,
                    response_format="verbose_json",
                    timestamp_granularities=["segment"],
                )
            segments = [
                {"start": seg.start, "end": seg.end, "text": seg.text.strip()}
                for seg in response.segments
            ]
            duration_seconds = segments[-1]["end"] if segments else 0.0
            estimated_cost = (duration_seconds / 60.0) * settings.OPENAI_COST_TRANSCRIBE_PER_MINUTE
            await record_ai_usage_event(
                provider="openai",
                model=settings.OPENAI_MODEL_TRANSCRIBE,
                operation="transcribe_video",
                request_count=1,
                estimated_cost_usd=estimated_cost,
                metadata_json={"duration_seconds": duration_seconds},
            )
            return segments
        except RateLimitError as e:
            raise AIProviderError(str(e), code="quota_exceeded") from e
        except AuthenticationError as e:
            raise AIProviderError(str(e), code="auth_error") from e
        except APIError as e:
            raise AIProviderError(str(e), code="provider_error") from e

    async def embed_text(self, text: str) -> list[float]:
        try:
            response = await self._client.embeddings.create(
                model=settings.OPENAI_MODEL_EMBEDDING,
                input=text,
            )
            usage = getattr(response, "usage", None)
            input_tokens = getattr(usage, "prompt_tokens", 0) or 0
            estimated_cost = (input_tokens / 1_000_000) * settings.OPENAI_COST_EMBED_INPUT_PER_1M
            await record_ai_usage_event(
                provider="openai",
                model=settings.OPENAI_MODEL_EMBEDDING,
                operation="embed_text",
                input_tokens=input_tokens,
                output_tokens=0,
                request_count=1,
                estimated_cost_usd=estimated_cost,
            )
            return response.data[0].embedding
        except RateLimitError as e:
            raise AIProviderError(str(e), code="quota_exceeded") from e
        except AuthenticationError as e:
            raise AIProviderError(str(e), code="auth_error") from e
        except APIError as e:
            raise AIProviderError(str(e), code="provider_error") from e

    async def caption_image_b64(self, image_b64: str, prompt: str) -> str:
        try:
            response = await self._client.chat.completions.create(
                model=settings.OPENAI_MODEL_CAPTION,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
                            },
                        ],
                    }
                ],
                max_tokens=150,
            )
            usage = getattr(response, "usage", None)
            input_tokens = getattr(usage, "prompt_tokens", 0) or 0
            output_tokens = getattr(usage, "completion_tokens", 0) or 0
            estimated_cost = self._price_from_tokens(
                input_tokens,
                output_tokens,
                settings.OPENAI_COST_TEXT_INPUT_PER_1M,
                settings.OPENAI_COST_TEXT_OUTPUT_PER_1M,
            )
            await record_ai_usage_event(
                provider="openai",
                model=settings.OPENAI_MODEL_CAPTION,
                operation="caption_image_b64",
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                request_count=1,
                estimated_cost_usd=estimated_cost,
            )
            return response.choices[0].message.content or ""
        except RateLimitError as e:
            raise AIProviderError(str(e), code="quota_exceeded") from e
        except AuthenticationError as e:
            raise AIProviderError(str(e), code="auth_error") from e
        except APIError as e:
            raise AIProviderError(str(e), code="provider_error") from e

    async def generate_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.3,
        response_schema: dict | None = None,
        schema_name: str = "structured_response",
    ) -> Any:
        try:
            response_format: dict[str, Any] = {"type": "json_object"}
            if response_schema is not None:
                response_format = {
                    "type": "json_schema",
                    "json_schema": {
                        "name": schema_name,
                        "strict": True,
                        "schema": response_schema,
                    },
                }
            response = await self._client.chat.completions.create(
                model=settings.OPENAI_MODEL_TEXT,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                response_format=response_format,
                temperature=temperature,
            )
            usage = getattr(response, "usage", None)
            input_tokens = getattr(usage, "prompt_tokens", 0) or 0
            output_tokens = getattr(usage, "completion_tokens", 0) or 0
            estimated_cost = self._price_from_tokens(
                input_tokens,
                output_tokens,
                settings.OPENAI_COST_TEXT_INPUT_PER_1M,
                settings.OPENAI_COST_TEXT_OUTPUT_PER_1M,
            )
            await record_ai_usage_event(
                provider="openai",
                model=settings.OPENAI_MODEL_TEXT,
                operation="generate_json",
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                request_count=1,
                estimated_cost_usd=estimated_cost,
            )
            return json.loads(response.choices[0].message.content or "{}")
        except RateLimitError as e:
            raise AIProviderError(str(e), code="quota_exceeded") from e
        except AuthenticationError as e:
            raise AIProviderError(str(e), code="auth_error") from e
        except APIError as e:
            raise AIProviderError(str(e), code="provider_error") from e
