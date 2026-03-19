from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.procedure import ProcedureStepIndex, ProcedureVersion
from app.services.embedding_service import get_embedding


def _normalize_origin(step: dict) -> str:
    origin = str(step.get("origin") or "auto").strip().lower()
    edited = bool(step.get("edited"))
    if origin == "manual":
        return "edited" if edited else "manual"
    return "edited" if edited else "auto"


def _build_step_reference(step: dict) -> dict | None:
    evidence = step.get("evidence")
    if not isinstance(evidence, dict):
        return None
    reference = {
        "segment_range": evidence.get("segment_range"),
        "quote": evidence.get("quote"),
        "origin": evidence.get("origin") or step.get("origin"),
        "edited": evidence.get("edited") if evidence.get("edited") is not None else step.get("edited"),
    }
    if any(value not in (None, "") for value in reference.values()):
        return reference
    return None


def _build_step_search_text(version: ProcedureVersion, step_number: int, step: dict) -> str:
    title = str(step.get("title") or f"Paso {step_number}").strip()
    description = str(step.get("description") or "").strip()
    reference = _build_step_reference(step)

    lines = [
        f"Procedimiento {version.procedure.code}",
        version.procedure.title,
        f"Version {version.version_number}",
        f"Paso {step_number}: {title}",
    ]
    if description:
        lines.append(description)
    if reference:
        if reference.get("quote"):
            lines.append(f"Referencia: {reference['quote']}")
        if reference.get("segment_range"):
            lines.append(f"Tramo fuente: {reference['segment_range']}")
    return "\n".join(lines).strip()


async def sync_procedure_step_index(db: AsyncSession, version: ProcedureVersion):
    await db.execute(delete(ProcedureStepIndex).where(ProcedureStepIndex.procedure_version_id == version.id))
    await db.flush()

    content = version.content_json or {}
    steps = content.get("steps") if isinstance(content, dict) else None
    if not isinstance(steps, list):
        return

    for position, step in enumerate(steps, start=1):
        if not isinstance(step, dict):
            continue
        title = str(step.get("title") or f"Paso {position}").strip()
        description = str(step.get("description") or "").strip()
        search_text = _build_step_search_text(version, position, step)
        db.add(
            ProcedureStepIndex(
                procedure_version_id=version.id,
                step_index=position,
                title=title[:500],
                description=description,
                reference_json=_build_step_reference(step),
                origin=_normalize_origin(step),
                search_text=search_text,
                embedding=await get_embedding(search_text),
            )
        )
    await db.flush()
