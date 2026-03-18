import asyncio
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.job import Job
from app.models.procedure import Procedure, ProcedureVersion, TaskProcedureLink
from app.models.role import Role, RoleTaskLink
from app.models.task import Task
from app.models.training import Training
from app.models.user import User
from app.schemas.training import GenerateResponse
from app.schemas.procedure import (
    ProcedureCreate,
    ProcedureDetailOut,
    ProcedureOut,
    ProcedureVersionCreate,
    ProcedureVersionSourceAssetWrite,
    ProcedureVersionOut,
    TaskProcedureLinkCreate,
    TaskProcedureLinkOut,
)
from app.services.ai_pipeline import run_source_processing, run_training_generation
from app.services.compliance_service import get_latest_procedure_version
from app.services.embedding_service import get_embedding

router = APIRouter(prefix="/procedures", tags=["procedures"])


def _normalize_required_text(value: str, field_name: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{field_name} is required")
    return normalized


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _build_initial_version_text(title: str, description: str | None) -> str:
    if description:
        return f"Version inicial de {title}. {description}"
    return f"Version inicial de {title}. Pendiente de completar el contenido detallado."


async def _generate_unique_procedure_code(db: AsyncSession, title: str) -> str:
    slug = re.sub(r"[^A-Z0-9]+", "-", title.upper()).strip("-") or "PROCEDURE"
    slug = slug[:24].rstrip("-") or "PROCEDURE"

    for _ in range(10):
        candidate = f"PROC-{slug}-{uuid.uuid4().hex[:6].upper()}"
        existing = (await db.execute(select(Procedure.id).where(Procedure.code == candidate))).scalar_one_or_none()
        if existing is None:
            return candidate

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Could not generate a unique procedure code",
    )


def _build_source_result(version: ProcedureVersion) -> dict | None:
    if version.source_processing_status != "READY":
        return None
    if not version.source_structure or not version.transcript:
        return None
    if not version.transcript.transcript_raw:
        return None

    return {
        "structure": version.source_structure.structure_json,
        "transcript_raw": version.transcript.transcript_raw,
    }


def _to_version_out(version: ProcedureVersion) -> ProcedureVersionOut:
    payload = ProcedureVersionOut.model_validate(version).model_dump()
    payload["source_result"] = _build_source_result(version)
    payload["derived_training"] = (
        {
            "id": str(version.training.id),
            "title": version.training.title,
            "status": version.training.status,
        }
        if version.training
        else None
    )
    return ProcedureVersionOut(**payload)


def _to_procedure_out(procedure: Procedure, latest_version: ProcedureVersion | None) -> ProcedureOut:
    return ProcedureOut(
        id=procedure.id,
        code=procedure.code,
        title=procedure.title,
        description=procedure.description,
        owner_role_id=procedure.owner_role_id,
        owner_role_name=procedure.owner_role.name if procedure.owner_role else None,
        status=procedure.status,
        created_by=procedure.created_by,
        created_at=procedure.created_at,
        updated_at=procedure.updated_at,
        latest_version=_to_version_out(latest_version) if latest_version else None,
    )


@router.get("", response_model=list[ProcedureOut])
async def list_procedures(db: AsyncSession = Depends(get_db)):
    procedures = list((await db.execute(select(Procedure).order_by(Procedure.updated_at.desc()))).scalars().all())
    output: list[ProcedureOut] = []
    for procedure in procedures:
        output.append(_to_procedure_out(procedure, await get_latest_procedure_version(db, procedure.id)))
    return output


@router.post("", response_model=ProcedureOut, status_code=status.HTTP_201_CREATED)
async def create_procedure(
    payload: ProcedureCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    title = _normalize_required_text(payload.title, "title")
    description = _normalize_optional_text(payload.description)

    if payload.owner_role_id:
        role = (await db.execute(select(Role).where(Role.id == payload.owner_role_id))).scalar_one_or_none()
        if role is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Owner role not found")

    source_asset = payload.source_asset
    content_text = _build_initial_version_text(title, description)
    procedure = Procedure(
        code=await _generate_unique_procedure_code(db, title),
        title=title,
        description=description,
        owner_role_id=payload.owner_role_id,
        created_by=current_user.id,
    )

    try:
        db.add(procedure)
        await db.flush()

        version = ProcedureVersion(
            procedure_id=procedure.id,
            version_number=1,
            status="draft",
            change_summary="Version inicial",
            effective_from=None,
            content_json=None,
            content_text=content_text,
            source_asset_type=source_asset.asset_type if source_asset else None,
            source_storage_key=source_asset.storage_key if source_asset else None,
            source_mime=source_asset.mime if source_asset else None,
            source_size=source_asset.size if source_asset else None,
            source_processing_status="UPLOADED" if source_asset else "pending",
            created_by=current_user.id,
            embedding=await get_embedding(content_text),
        )
        db.add(version)
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Could not create procedure") from exc
    except Exception:
        await db.rollback()
        raise

    procedure = (
        await db.execute(select(Procedure).where(Procedure.id == procedure.id).options(selectinload(Procedure.owner_role)))
    ).scalar_one()
    version = (
        await db.execute(select(ProcedureVersion).where(ProcedureVersion.procedure_id == procedure.id))
    ).scalar_one()

    if version.source_storage_key:
        asyncio.create_task(run_source_processing(version.id))

    return _to_procedure_out(procedure, version)


@router.get("/{procedure_id}", response_model=ProcedureDetailOut)
async def get_procedure(procedure_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    procedure = (
        await db.execute(
            select(Procedure)
            .where(Procedure.id == procedure_id)
            .options(
                selectinload(Procedure.task_links)
                .selectinload(TaskProcedureLink.task)
                .selectinload(Task.role_links)
                .selectinload(RoleTaskLink.role)
            )
        )
    ).scalar_one_or_none()
    if procedure is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Procedure not found")

    versions = list(
        (
            await db.execute(
                select(ProcedureVersion)
                .where(ProcedureVersion.procedure_id == procedure_id)
                .order_by(ProcedureVersion.version_number.desc())
            )
        )
        .scalars()
        .all()
    )
    task_links = list(
        (await db.execute(select(TaskProcedureLink).where(TaskProcedureLink.procedure_id == procedure_id))).scalars().all()
    )
    role_map: dict[uuid.UUID, dict] = {}
    for task_link in procedure.task_links:
        for role_link in task_link.task.role_links:
            role_map[role_link.role_id] = {
                "id": task_link.task_id,
                "role_id": role_link.role_id,
                "role_code": role_link.role.code,
                "role_name": role_link.role.name,
                "is_required": role_link.is_required,
            }

    return ProcedureDetailOut(
        **_to_procedure_out(procedure, versions[0] if versions else None).model_dump(),
        versions=[_to_version_out(version) for version in versions],
        linked_tasks=[
            {"id": str(link.id), "task_id": str(link.task_id), "task_title": link.task.title, "is_primary": link.is_primary}
            for link in task_links
        ],
        roles=list(role_map.values()),
    )


@router.delete("/{procedure_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_procedure(
    procedure_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    procedure = (await db.execute(select(Procedure.id).where(Procedure.id == procedure_id))).scalar_one_or_none()
    if procedure is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Procedure not found")

    await db.execute(delete(Procedure).where(Procedure.id == procedure_id))
    await db.commit()


@router.post("/{procedure_id}/versions", response_model=ProcedureVersionOut, status_code=status.HTTP_201_CREATED)
async def create_procedure_version(
    procedure_id: uuid.UUID,
    payload: ProcedureVersionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    procedure = (await db.execute(select(Procedure).where(Procedure.id == procedure_id))).scalar_one_or_none()
    if procedure is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Procedure not found")

    next_version = (
        (
            await db.execute(
                select(func.max(ProcedureVersion.version_number)).where(ProcedureVersion.procedure_id == procedure_id)
            )
        )
        .scalar()
        or 0
    ) + 1
    embedding = await get_embedding(payload.content_text)
    version = ProcedureVersion(
        procedure_id=procedure_id,
        version_number=next_version,
        created_by=current_user.id,
        embedding=embedding,
        **payload.model_dump(),
    )
    db.add(version)
    await db.commit()
    await db.refresh(version)
    return _to_version_out(version)


@router.post(
    "/task-links",
    response_model=TaskProcedureLinkOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_task_procedure_link(
    payload: TaskProcedureLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = (await db.execute(select(Task).where(Task.id == payload.task_id))).scalar_one_or_none()
    procedure = (await db.execute(select(Procedure).where(Procedure.id == payload.procedure_id))).scalar_one_or_none()
    if task is None or procedure is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task or procedure not found")

    existing = (
        await db.execute(
            select(TaskProcedureLink).where(
                TaskProcedureLink.task_id == payload.task_id,
                TaskProcedureLink.procedure_id == payload.procedure_id,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        existing = TaskProcedureLink(**payload.model_dump())
        db.add(existing)
        await db.commit()
        await db.refresh(existing)

    return TaskProcedureLinkOut(
        id=existing.id,
        task_id=existing.task_id,
        task_title=existing.task.title,
        procedure_id=existing.procedure_id,
        procedure_title=existing.procedure.title,
        is_primary=existing.is_primary,
    )


@router.post(
    "/versions/{version_id}/source-asset",
    response_model=ProcedureVersionOut,
    status_code=status.HTTP_201_CREATED,
)
async def register_procedure_version_source_asset(
    version_id: uuid.UUID,
    payload: ProcedureVersionSourceAssetWrite,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    version = (await db.execute(select(ProcedureVersion).where(ProcedureVersion.id == version_id))).scalar_one_or_none()
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Procedure version not found")

    version.source_asset_type = payload.asset_type
    version.source_storage_key = payload.storage_key
    version.source_mime = payload.mime
    version.source_size = payload.size
    version.source_processing_status = "UPLOADED"
    version.source_processing_error = None
    version.source_processed_at = None
    await db.commit()
    await db.refresh(version)
    asyncio.create_task(run_source_processing(version.id))
    return _to_version_out(version)


@router.post(
    "/versions/{version_id}/generate-training",
    response_model=GenerateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_training_from_procedure_version(
    version_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    version = (await db.execute(select(ProcedureVersion).where(ProcedureVersion.id == version_id))).scalar_one_or_none()
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Procedure version not found")
    if not version.source_storage_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debes subir un video fuente a la versión antes de generar el training.",
        )
    if version.source_processing_status != "READY":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La versión todavía está procesando la fuente. Espera a que quede READY antes de generar el training.",
        )

    training = (
        await db.execute(select(Training).where(Training.procedure_version_id == version_id))
    ).scalar_one_or_none()
    if training is None:
        training = Training(
            procedure_version_id=version.id,
            title=f"{version.procedure.title} · v{version.version_number}",
            summary=version.change_summary or f"Training derivado de {version.procedure.code} v{version.version_number}",
            status="draft",
            created_by=current_user.id,
        )
        db.add(training)
        await db.flush()

    job = Job(training_id=training.id, type="generate", status="UPLOADED", progress=0)
    db.add(job)
    await db.commit()
    await db.refresh(job)
    asyncio.create_task(run_training_generation(training.id, job.id))
    return GenerateResponse(job_id=job.id, training_id=training.id)
