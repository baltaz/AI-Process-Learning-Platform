import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.incident import Incident
from app.models.procedure import Procedure, TaskProcedureLink
from app.models.role import Role, RoleTaskLink, UserRoleAssignment
from app.models.task import Task
from app.models.user import User
from app.schemas.role import (
    RoleCreate,
    RoleDetailOut,
    RoleOut,
    RoleProcedureLinkCreate,
    RoleProcedureLinkOut,
    RoleTaskLinkCreate,
    RoleTaskLinkOut,
    RoleUpdate,
    UserRoleAssignmentCreate,
    UserRoleAssignmentOut,
)
from app.services.compliance_service import get_active_user_ids_for_role, sync_procedure_rollout, sync_user_procedure_compliance

router = APIRouter(prefix="/roles", tags=["roles"])


def _valid_role_task_links(role: Role) -> list[RoleTaskLink]:
    # TEMPORARY: tolerate orphan links from inconsistent DB state in production.
    # Revert this filter once orphan rows are cleaned up and FK consistency is verified.
    return [link for link in role.task_links if link.task is not None]


def _procedure_count(role: Role) -> int:
    procedure_ids: set[uuid.UUID] = set()
    for link in _valid_role_task_links(role):
        for procedure_link in link.task.procedure_links:
            if procedure_link.procedure is not None:
                procedure_ids.add(procedure_link.procedure_id)
    return len(procedure_ids)


def _role_out(role: Role) -> RoleOut:
    return RoleOut(
        **RoleOut.model_validate(role).model_dump(exclude={"procedure_count"}),
        procedure_count=_procedure_count(role),
    )


def _role_detail_out(role: Role) -> RoleDetailOut:
    procedure_map: dict[uuid.UUID, dict] = {}
    valid_links = _valid_role_task_links(role)
    for link in valid_links:
        for procedure_link in link.task.procedure_links:
            if procedure_link.procedure is None:
                continue
            procedure_map[procedure_link.procedure_id] = {
                "id": link.task_id,
                "procedure_id": procedure_link.procedure_id,
                "procedure_code": procedure_link.procedure.code,
                "procedure_title": procedure_link.procedure.title,
                "is_required": link.is_required,
            }

    return RoleDetailOut(
        **RoleOut.model_validate(role).model_dump(),
        tasks=[
            {
                "id": link.id,
                "task_id": link.task_id,
                "task_title": link.task.title,
                "is_required": link.is_required,
            }
            for link in valid_links
        ],
        procedures=list(procedure_map.values()),
    )


async def _get_role_or_404(role_id: uuid.UUID, db: AsyncSession) -> Role:
    role = (
        await db.execute(
            select(Role)
            .where(Role.id == role_id)
            .options(
                selectinload(Role.task_links)
                .selectinload(RoleTaskLink.task)
                .selectinload(Task.procedure_links)
                .selectinload(TaskProcedureLink.procedure)
            )
        )
    ).scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    return role


@router.get("", response_model=list[RoleOut])
async def list_roles(db: AsyncSession = Depends(get_db)):
    roles = list(
        (
            await db.execute(
                select(Role)
                .order_by(Role.updated_at.desc())
                .options(
                    selectinload(Role.task_links)
                    .selectinload(RoleTaskLink.task)
                    .selectinload(Task.procedure_links)
                    .selectinload(TaskProcedureLink.procedure)
                )
            )
        )
        .scalars()
        .all()
    )
    return [_role_out(role) for role in roles]


@router.post("", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
async def create_role(
    payload: RoleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = (
        await db.execute(select(Role).where((Role.code == payload.code) | (Role.name == payload.name)))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Role already exists")

    role = Role(code=payload.code, name=payload.name, description=payload.description)
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return _role_out(role)


@router.get("/assignments", response_model=list[UserRoleAssignmentOut])
async def list_user_role_assignments(db: AsyncSession = Depends(get_db)):
    assignments = list(
        (await db.execute(select(UserRoleAssignment).order_by(UserRoleAssignment.created_at.desc()))).scalars().all()
    )
    return [
        UserRoleAssignmentOut(
            id=item.id,
            user_id=item.user_id,
            user_name=item.user.name,
            role_id=item.role_id,
            role_name=item.role.name,
            role_code=item.role.code,
            location=item.location,
            status=item.status,
            starts_on=item.starts_on,
            ends_on=item.ends_on,
            created_at=item.created_at,
        )
        for item in assignments
        if item.role is not None and item.user is not None
    ]


@router.post("/assignments", response_model=UserRoleAssignmentOut, status_code=status.HTTP_201_CREATED)
async def create_user_role_assignment(
    payload: UserRoleAssignmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = (await db.execute(select(User).where(User.id == payload.user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    role = (await db.execute(select(Role).where(Role.id == payload.role_id))).scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

    assignment = UserRoleAssignment(**payload.model_dump())
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return UserRoleAssignmentOut(
        id=assignment.id,
        user_id=assignment.user_id,
        user_name=assignment.user.name,
        role_id=assignment.role_id,
        role_name=assignment.role.name,
        role_code=assignment.role.code,
        location=assignment.location,
        status=assignment.status,
        starts_on=assignment.starts_on,
        ends_on=assignment.ends_on,
        created_at=assignment.created_at,
    )


@router.get("/task-links", response_model=list[RoleTaskLinkOut])
async def list_role_task_links(db: AsyncSession = Depends(get_db)):
    links = list((await db.execute(select(RoleTaskLink))).scalars().all())
    return [
        RoleTaskLinkOut(
            id=link.id,
            role_id=link.role_id,
            role_name=link.role.name,
            task_id=link.task_id,
            task_title=link.task.title,
            is_required=link.is_required,
        )
        for link in links
        if link.role is not None and link.task is not None
    ]


@router.post("/task-links", response_model=RoleTaskLinkOut, status_code=status.HTTP_201_CREATED)
async def create_role_task_link(
    payload: RoleTaskLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = (await db.execute(select(Role).where(Role.id == payload.role_id))).scalar_one_or_none()
    task = (await db.execute(select(Task).where(Task.id == payload.task_id))).scalar_one_or_none()
    if role is None or task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role or task not found")

    existing = (
        await db.execute(
            select(RoleTaskLink).where(RoleTaskLink.role_id == payload.role_id, RoleTaskLink.task_id == payload.task_id)
        )
    ).scalar_one_or_none()
    if existing:
        return RoleTaskLinkOut(
            id=existing.id,
            role_id=existing.role_id,
            role_name=existing.role.name,
            task_id=existing.task_id,
            task_title=existing.task.title,
            is_required=existing.is_required,
        )

    link = RoleTaskLink(**payload.model_dump())
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return RoleTaskLinkOut(
        id=link.id,
        role_id=link.role_id,
        role_name=link.role.name,
        task_id=link.task_id,
        task_title=link.task.title,
        is_required=link.is_required,
    )


@router.post("/procedure-links", response_model=RoleProcedureLinkOut, status_code=status.HTTP_201_CREATED)
async def create_role_procedure_link(
    payload: RoleProcedureLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = (await db.execute(select(Role).where(Role.id == payload.role_id))).scalar_one_or_none()
    procedure = (await db.execute(select(Procedure).where(Procedure.id == payload.procedure_id))).scalar_one_or_none()
    if role is None or procedure is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role or procedure not found")

    existing_link = (
        await db.execute(
            select(RoleTaskLink)
            .join(TaskProcedureLink, RoleTaskLink.task_id == TaskProcedureLink.task_id)
            .where(
                RoleTaskLink.role_id == payload.role_id,
                TaskProcedureLink.procedure_id == payload.procedure_id,
            )
        )
    ).scalars().first()
    if existing_link is not None:
        existing_link.is_required = payload.is_required
        await db.commit()
        if payload.is_required:
            await sync_procedure_rollout(db, procedure.id)
        else:
            await sync_user_procedure_compliance(db, user_ids=await get_active_user_ids_for_role(db, role.id))
        await db.commit()
        await db.refresh(existing_link)
        return RoleProcedureLinkOut(
            id=existing_link.task_id,
            role_id=existing_link.role_id,
            role_name=existing_link.role.name,
            procedure_id=procedure.id,
            procedure_code=procedure.code,
            procedure_title=procedure.title,
            is_required=existing_link.is_required,
        )

    task = Task(
        title=f"{role.name} · {procedure.title}",
        description=f"[hidden-role-procedure] role={role.code} procedure={procedure.code}",
    )
    db.add(task)
    await db.flush()

    db.add(RoleTaskLink(role_id=role.id, task_id=task.id, is_required=payload.is_required))
    db.add(TaskProcedureLink(task_id=task.id, procedure_id=procedure.id, is_primary=True))
    await db.commit()
    if payload.is_required:
        await sync_procedure_rollout(db, procedure.id)
    else:
        await sync_user_procedure_compliance(db, user_ids=await get_active_user_ids_for_role(db, role.id))
    await db.commit()

    return RoleProcedureLinkOut(
        id=task.id,
        role_id=role.id,
        role_name=role.name,
        procedure_id=procedure.id,
        procedure_code=procedure.code,
        procedure_title=procedure.title,
        is_required=payload.is_required,
    )


@router.delete("/task-links/{link_id}", response_model=RoleDetailOut)
async def delete_role_task_link(
    link_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    link = (await db.execute(select(RoleTaskLink).where(RoleTaskLink.id == link_id))).scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role task link not found")
    role_id = link.role_id
    await db.delete(link)
    await db.commit()
    return _role_detail_out(await _get_role_or_404(role_id, db))


@router.delete("/procedure-links/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role_procedure_link(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = (
        await db.execute(
            select(Task)
            .where(Task.id == task_id)
            .options(
                selectinload(Task.role_links),
                selectinload(Task.procedure_links),
            )
        )
    ).scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role procedure link not found")
    if len(task.role_links) != 1 or len(task.procedure_links) != 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Task is not a dedicated role-procedure link",
        )

    role_id = task.role_links[0].role_id
    await db.delete(task)
    await db.commit()
    await sync_user_procedure_compliance(db, user_ids=await get_active_user_ids_for_role(db, role_id))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{role_id}", response_model=RoleDetailOut)
async def get_role(role_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    return _role_detail_out(await _get_role_or_404(role_id, db))


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = (await db.execute(select(Role).where(Role.id == role_id))).scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

    procedures = list(
        (await db.execute(select(Procedure).where(Procedure.owner_role_id == role_id))).scalars().all()
    )
    for procedure in procedures:
        procedure.owner_role_id = None

    incidents = list((await db.execute(select(Incident).where(Incident.role_id == role_id))).scalars().all())
    for incident in incidents:
        incident.role_id = None

    assignments = list(
        (await db.execute(select(UserRoleAssignment).where(UserRoleAssignment.role_id == role_id))).scalars().all()
    )
    for assignment in assignments:
        await db.delete(assignment)

    task_links = list((await db.execute(select(RoleTaskLink).where(RoleTaskLink.role_id == role_id))).scalars().all())
    for link in task_links:
        await db.delete(link)

    await db.delete(role)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{role_id}", response_model=RoleDetailOut)
async def update_role(
    role_id: uuid.UUID,
    payload: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = await _get_role_or_404(role_id, db)
    role.code = payload.code
    role.name = payload.name
    role.description = payload.description
    role.is_active = payload.is_active
    await db.commit()
    await db.refresh(role)
    return _role_detail_out(role)
