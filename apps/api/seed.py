"""Seed script: creates demo users in the database."""
import asyncio

from sqlalchemy import select

from app.core.database import async_session, engine, Base
from app.core.security import hash_password
from app.models.user import User
import app.models  # noqa: F401


DEMO_USERS = [
    {"name": "Admin Demo", "email": "admin@demo.com", "password": "admin123", "role": "admin", "location": "Buenos Aires"},
    {"name": "Chef Carlos", "email": "carlos@demo.com", "password": "demo123", "role": "kitchen", "location": "Buenos Aires"},
    {"name": "Ana García", "email": "ana@demo.com", "password": "demo123", "role": "employee", "location": "Córdoba"},
    {"name": "Luis Martínez", "email": "luis@demo.com", "password": "demo123", "role": "supervisor", "location": "Buenos Aires"},
]


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        for u in DEMO_USERS:
            result = await db.execute(select(User).where(User.email == u["email"]))
            if result.scalar_one_or_none():
                print(f"  User {u['email']} already exists, skipping")
                continue

            user = User(
                name=u["name"],
                email=u["email"],
                hashed_password=hash_password(u["password"]),
                role=u["role"],
                location=u["location"],
            )
            db.add(user)
            print(f"  Created user {u['email']}")

        await db.commit()

    print("Seed complete!")


if __name__ == "__main__":
    asyncio.run(seed())
