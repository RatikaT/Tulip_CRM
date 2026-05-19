"""
Seed script to add sample agent users for local testing.

Run with:
    cd backend && .venv/bin/python seed_agents.py
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie

from app.config import settings
from app.models.user import User, UserRole
from app.services.auth_service import hash_password


AGENTS = [
    {
        "username": "anjali",
        "email": "anjali@tulip.com",
        "full_name": "Anjali Sharma",
        "password": "Agent@12345",
        "crm_types": ["tulip"],
    },
    {
        "username": "rahul",
        "email": "rahul@tulip.com",
        "full_name": "Rahul Verma",
        "password": "Agent@12345",
        "crm_types": ["tulip"],
    },
    {
        "username": "priya",
        "email": "priya@tulip.com",
        "full_name": "Priya Iyer",
        "password": "Agent@12345",
        "crm_types": ["tulip", "health_compass"],
    },
]


async def seed_agents():
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    db = client.get_default_database()
    await init_beanie(database=db, document_models=[User])

    print(f"Connected to {settings.MONGODB_URI}")

    inserted = 0
    skipped = 0
    for agent in AGENTS:
        existing = await User.find_one(User.email == agent["email"])
        if existing:
            print(f"Skip (exists): {agent['email']}")
            skipped += 1
            continue

        user = User(
            username=agent["username"],
            email=agent["email"],
            full_name=agent["full_name"],
            password_hash=hash_password(agent["password"]),
            role=UserRole.AGENT,
            is_active=True,
            crm_types=agent["crm_types"],
            created_by="seed_script",
        )
        await user.insert()
        inserted += 1
        print(f"Created agent: {agent['email']} / {agent['password']}")

    print(f"\nInserted: {inserted}, Skipped: {skipped}")
    client.close()


if __name__ == "__main__":
    asyncio.run(seed_agents())
