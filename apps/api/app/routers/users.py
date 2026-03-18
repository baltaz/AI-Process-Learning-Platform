import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import hash_password
from app.models.role import Role, UserRoleAssignment
from app.models.user import User
from app.schemas.user import UserCreate, UserOut, UserRoleAssignmentInput, UserUpdate
from app.services.compliance_service import sync_user_procedure_compliance

router = APIRouter(prefix="/users", tags=["users"])


def _serialize_user(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        location=user.location,
        created_at=user.created_at,
        role_assignments=[
            {
                "id": assignment.id,
                "role_id": assignment.role_id,
                "location": assignment.location,
                "status": assignment.status,
                "starts_on": assignment.starts_on,
                "ends_on": assignment.ends_on,
                "created_at": assignment.created_at,
                "role": assignment.role,
            }
            for assignment in sorted(user.role_assignments, key=lambda item: (item.status != "active", item.created_at))
        ],
    )


async def _load_user_with_roles(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    return (
        (
            await db.execute(
                select(User)
                .where(User.id == user_id)
                .options(selectinload(User.role_assignments).selectinload(UserRoleAssignment.role))
            )
        )
        .scalars()
        .one_or_none()
    )


async def _sync_role_assignments(
    db: AsyncSession,
    user: User,
    assignments_payload: list[UserRoleAssignmentInput],
):
    if len({item.role_id for item in assignments_payload}) != len(assignments_payload):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user cannot have the same role assigned more than once",
        )

    role_ids = {item.role_id for item in assignments_payload}
    if role_ids:
        roles = list((await db.execute(select(Role).where(Role.id.in_(role_ids)))).scalars().all())
        if len({role.id for role in roles}) != len(role_ids):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more roles were not found")

    existing_assignments = {
        assignment.id: assignment
        for assignment in (
            await db.execute(select(UserRoleAssignment).where(UserRoleAssignment.user_id == user.id))
        )
        .scalars()
        .all()
    }
    incoming_ids = {item.id for item in assignments_payload if item.id is not None}
    unknown_ids = incoming_ids - set(existing_assignments.keys())
    if unknown_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role assignment id")

    desired_role_ids = {item.role_id for item in assignments_payload}
    conflicting_omissions = [
        assignment.id
        for assignment in existing_assignments.values()
        if assignment.id not in incoming_ids and assignment.role_id in desired_role_ids
    ]
    if conflicting_omissions:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Reuse the existing role assignment row instead of recreating the same role",
        )

    for item in assignments_payload:
        if item.id is not None:
            assignment = existing_assignments[item.id]
            assignment.role_id = item.role_id
            assignment.location = item.location
            assignment.status = item.status
            assignment.starts_on = item.starts_on
            assignment.ends_on = item.ends_on
        else:
            db.add(
                UserRoleAssignment(
                    user_id=user.id,
                    role_id=item.role_id,
                    location=item.location,
                    status=item.status,
                    starts_on=item.starts_on,
                    ends_on=item.ends_on,
                )
            )

    for assignment in existing_assignments.values():
        if assignment.id not in incoming_ids and assignment.status == "active":
            assignment.status = "inactive"
            assignment.ends_on = assignment.ends_on or date.today()


@router.get("", response_model=list[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    users = list(
        (
            await db.execute(
                select(User)
                .order_by(User.name.asc())
                .options(selectinload(User.role_assignments).selectinload(UserRoleAssignment.role))
            )
        )
        .scalars()
        .all()
    )
    return [_serialize_user(user) for user in users]


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = await _load_user_with_roles(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _serialize_user(user)


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        location=payload.location,
    )
    db.add(user)
    await db.flush()
    await _sync_role_assignments(db, user, payload.role_assignments)
    await sync_user_procedure_compliance(db, user_ids=[user.id])
    await db.commit()
    user = await _load_user_with_roles(db, user.id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found after creation")
    return _serialize_user(user)


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = await _load_user_with_roles(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    changes = payload.model_dump(exclude_unset=True)
    if "email" in changes:
        existing = (
            await db.execute(select(User).where(User.email == changes["email"], User.id != user_id))
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    role_assignments = changes.pop("role_assignments", None)
    if "password" in changes:
        user.hashed_password = hash_password(changes.pop("password"))

    for field, value in changes.items():
        setattr(user, field, value)

    if role_assignments is not None:
        await _sync_role_assignments(
            db,
            user,
            [UserRoleAssignmentInput.model_validate(item) for item in role_assignments],
        )

    await sync_user_procedure_compliance(db, user_ids=[user.id])
    await db.commit()
    user = await _load_user_with_roles(db, user.id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found after update")
    return _serialize_user(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.id == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own user")

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await db.delete(user)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User cannot be deleted because it is referenced by other records",
        ) from None

    return Response(status_code=status.HTTP_204_NO_CONTENT)
