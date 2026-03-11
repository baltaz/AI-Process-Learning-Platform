import asyncio
import base64
import json
import mimetypes
import re
import time
from typing import Any

import httpx

from app.core.config import settings
from app.services.ai.providers.base import AIProvider, AIProviderError
from app.services.ai.usage_tracking import record_ai_usage_event


class GeminiProvider(AIProvider):
    def __init__(self) -> None:
        self._http = httpx.AsyncClient(timeout=120)
        self._base_url = settings.GEMINI_BASE_URL.rstrip("/")
        self._api_key = settings.GEMINI_API_KEY
        self._request_lock = asyncio.Lock()
        self._next_request_at = 0.0

    async def _throttle(self) -> None:
        min_interval = max(settings.GEMINI_MIN_REQUEST_INTERVAL_SECONDS, 0.0)
        if min_interval == 0:
            return
        async with self._request_lock:
            now = time.monotonic()
            wait_for = max(self._next_request_at - now, 0.0)
            if wait_for > 0:
                await asyncio.sleep(wait_for)
            self._next_request_at = time.monotonic() + min_interval

    @staticmethod
    def _parse_retry_delay_seconds(response: httpx.Response) -> float | None:
        retry_after = response.headers.get("Retry-After")
        if retry_after:
            try:
                return float(retry_after)
            except ValueError:
                pass
        try:
            payload = response.json()
            details = payload.get("error", {}).get("details", [])
            for item in details:
                retry_delay = item.get("retryDelay")
                if isinstance(retry_delay, str):
                    match = re.match(r"^([0-9]+(?:\.[0-9]+)?)s$", retry_delay)
                    if match:
                        return float(match.group(1))
        except Exception:
            return None
        return None

    async def _post(self, path: str, payload: dict) -> dict:
        if not self._api_key:
            raise AIProviderError("GEMINI_API_KEY is missing", code="auth_error")

        url = f"{self._base_url}{path}"
        last_error: str | None = None
        for attempt in range(settings.GEMINI_MAX_RETRIES + 1):
            await self._throttle()
            try:
                response = await self._http.post(url, params={"key": self._api_key}, json=payload)
            except httpx.TimeoutException as e:
                last_error = str(e)
                if attempt < settings.GEMINI_MAX_RETRIES:
                    backoff = settings.GEMINI_RETRY_BASE_SECONDS * (2 ** attempt)
                    await asyncio.sleep(backoff)
                    continue
                raise AIProviderError(last_error, code="provider_error") from e
            except httpx.HTTPError as e:
                raise AIProviderError(str(e), code="provider_error") from e

            if response.status_code == 429:
                last_error = response.text
                if attempt < settings.GEMINI_MAX_RETRIES:
                    retry_delay = self._parse_retry_delay_seconds(response)
                    backoff = settings.GEMINI_RETRY_BASE_SECONDS * (2 ** attempt)
                    await asyncio.sleep(retry_delay if retry_delay is not None else backoff)
                    continue
                raise AIProviderError(last_error, code="quota_exceeded")
            if response.status_code in (401, 403):
                raise AIProviderError(response.text, code="auth_error")
            if response.status_code in (500, 502, 503, 504):
                last_error = response.text
                if attempt < settings.GEMINI_MAX_RETRIES:
                    backoff = settings.GEMINI_RETRY_BASE_SECONDS * (2 ** attempt)
                    await asyncio.sleep(backoff)
                    continue
                raise AIProviderError(last_error, code="provider_error")
            if response.status_code >= 400:
                raise AIProviderError(response.text, code="provider_error")
            return response.json()
        raise AIProviderError(last_error or "Unknown Gemini provider error", code="provider_error")

    @staticmethod
    def _extract_text(data: dict) -> str:
        candidates = data.get("candidates", [])
        if not candidates:
            return ""
        content = candidates[0].get("content", {})
        parts = content.get("parts", [])
        if not parts:
            return ""
        return parts[0].get("text", "")

    @staticmethod
    def _extract_usage_tokens(data: dict) -> tuple[int, int]:
        usage = data.get("usageMetadata", {}) or {}
        input_tokens = int(usage.get("promptTokenCount", 0) or 0)
        output_tokens = int(usage.get("candidatesTokenCount", 0) or 0)
        return input_tokens, output_tokens

    @staticmethod
    def _price_from_tokens(input_tokens: int, output_tokens: int, input_price_1m: float, output_price_1m: float) -> float:
        return (input_tokens / 1_000_000) * input_price_1m + (output_tokens / 1_000_000) * output_price_1m

    @classmethod
    def _to_gemini_response_schema(cls, schema: dict[str, Any]) -> dict[str, Any]:
        converted: dict[str, Any] = {}

        schema_type = schema.get("type")
        if isinstance(schema_type, str):
            converted["type"] = schema_type.upper()

        if "properties" in schema and isinstance(schema["properties"], dict):
            converted["properties"] = {
                key: cls._to_gemini_response_schema(value)
                for key, value in schema["properties"].items()
                if isinstance(value, dict)
            }

        if "items" in schema and isinstance(schema["items"], dict):
            converted["items"] = cls._to_gemini_response_schema(schema["items"])

        if "required" in schema and isinstance(schema["required"], list):
            converted["required"] = schema["required"]

        if "enum" in schema and isinstance(schema["enum"], list):
            converted["enum"] = schema["enum"]

        if "description" in schema and isinstance(schema["description"], str):
            converted["description"] = schema["description"]

        if "additionalProperties" in schema and isinstance(schema["additionalProperties"], bool):
            converted["propertyOrdering"] = list(converted.get("properties", {}).keys())

        return converted

    async def transcribe_video(self, video_path: str) -> list[dict]:
        with open(video_path, "rb") as f:
            raw_video = f.read()
        mime, _ = mimetypes.guess_type(video_path)
        mime = mime or "video/mp4"
        video_b64 = base64.b64encode(raw_video).decode()

        prompt = (
            "Transcribe el video en espanol y responde SOLO JSON valido con este formato: "
            '{"segments":[{"start":0.0,"end":5.0,"text":"..."}]}. '
            "Usa segundos decimales para start/end."
        )
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": prompt},
                        {"inline_data": {"mime_type": mime, "data": video_b64}},
                    ],
                }
            ],
            "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"},
        }
        data = await self._post(f"/models/{settings.GEMINI_MODEL_TRANSCRIBE}:generateContent", payload)
        input_tokens, output_tokens = self._extract_usage_tokens(data)
        text = self._extract_text(data)
        parsed = json.loads(text or "{}")
        segments = parsed.get("segments", [])
        duration_seconds = segments[-1]["end"] if segments else 0.0
        estimated_cost = (duration_seconds / 60.0) * settings.GEMINI_COST_TRANSCRIBE_PER_MINUTE
        await record_ai_usage_event(
            provider="gemini",
            model=settings.GEMINI_MODEL_TRANSCRIBE,
            operation="transcribe_video",
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            request_count=1,
            estimated_cost_usd=estimated_cost,
            metadata_json={"duration_seconds": duration_seconds},
        )
        return segments

    async def embed_text(self, text: str) -> list[float]:
        payload = {
            "content": {"parts": [{"text": text}]},
            "outputDimensionality": settings.AI_EMBEDDING_DIM,
        }
        data = await self._post(f"/models/{settings.GEMINI_MODEL_EMBEDDING}:embedContent", payload)
        input_tokens, _ = self._extract_usage_tokens(data)
        estimated_cost = (input_tokens / 1_000_000) * settings.GEMINI_COST_EMBED_INPUT_PER_1M
        await record_ai_usage_event(
            provider="gemini",
            model=settings.GEMINI_MODEL_EMBEDDING,
            operation="embed_text",
            input_tokens=input_tokens,
            output_tokens=0,
            request_count=1,
            estimated_cost_usd=estimated_cost,
        )
        values = data.get("embedding", {}).get("values", [])
        target_dim = settings.AI_EMBEDDING_DIM
        if len(values) == target_dim:
            return values
        if len(values) > target_dim:
            return values[:target_dim]
        if len(values) < target_dim:
            return values + [0.0] * (target_dim - len(values))
        return values

    async def caption_image_b64(self, image_b64: str, prompt: str) -> str:
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": prompt},
                        {"inline_data": {"mime_type": "image/jpeg", "data": image_b64}},
                    ],
                }
            ],
            "generationConfig": {"temperature": 0.2},
        }
        data = await self._post(f"/models/{settings.GEMINI_MODEL_CAPTION}:generateContent", payload)
        input_tokens, output_tokens = self._extract_usage_tokens(data)
        estimated_cost = self._price_from_tokens(
            input_tokens,
            output_tokens,
            settings.GEMINI_COST_TEXT_INPUT_PER_1M,
            settings.GEMINI_COST_TEXT_OUTPUT_PER_1M,
        )
        await record_ai_usage_event(
            provider="gemini",
            model=settings.GEMINI_MODEL_CAPTION,
            operation="caption_image_b64",
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            request_count=1,
            estimated_cost_usd=estimated_cost,
        )
        return self._extract_text(data)

    async def generate_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.3,
        response_schema: dict | None = None,
        schema_name: str = "structured_response",
    ) -> Any:
        generation_config: dict[str, Any] = {
            "temperature": temperature,
            "responseMimeType": "application/json",
        }
        if response_schema is not None:
            generation_config["responseSchema"] = self._to_gemini_response_schema(response_schema)

        payload = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "generationConfig": generation_config,
        }
        data = await self._post(f"/models/{settings.GEMINI_MODEL_TEXT}:generateContent", payload)
        input_tokens, output_tokens = self._extract_usage_tokens(data)
        estimated_cost = self._price_from_tokens(
            input_tokens,
            output_tokens,
            settings.GEMINI_COST_TEXT_INPUT_PER_1M,
            settings.GEMINI_COST_TEXT_OUTPUT_PER_1M,
        )
        await record_ai_usage_event(
            provider="gemini",
            model=settings.GEMINI_MODEL_TEXT,
            operation="generate_json",
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            request_count=1,
            estimated_cost_usd=estimated_cost,
        )
        text = self._extract_text(data)
        return json.loads(text or "{}")
