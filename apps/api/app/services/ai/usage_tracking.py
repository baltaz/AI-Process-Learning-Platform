import logging
import uuid
from contextvars import ContextVar

from app.core.database import async_session
from app.models.ai_usage_event import AIUsageEvent

logger = logging.getLogger(__name__)

_training_id_ctx: ContextVar[uuid.UUID | None] = ContextVar("ai_usage_training_id", default=None)
_stage_ctx: ContextVar[str | None] = ContextVar("ai_usage_stage", default=None)


def set_ai_usage_context(training_id: uuid.UUID | None = None, stage: str | None = None) -> None:
    if training_id is not None:
        _training_id_ctx.set(training_id)
    if stage is not None:
        _stage_ctx.set(stage)


def clear_ai_usage_context() -> None:
    _training_id_ctx.set(None)
    _stage_ctx.set(None)


async def record_ai_usage_event(
    *,
    provider: str,
    model: str,
    operation: str,
    input_tokens: int = 0,
    output_tokens: int = 0,
    request_count: int = 1,
    estimated_cost_usd: float = 0.0,
    metadata_json: dict | None = None,
) -> None:
    try:
        async with async_session() as db:
            db.add(
                AIUsageEvent(
                    training_id=_training_id_ctx.get(),
                    provider=provider,
                    model=model,
                    operation=operation,
                    stage=_stage_ctx.get(),
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    request_count=request_count,
                    estimated_cost_usd=estimated_cost_usd,
                    metadata_json=metadata_json,
                )
            )
            await db.commit()
    except Exception:
        logger.exception("Failed to persist AI usage event")
