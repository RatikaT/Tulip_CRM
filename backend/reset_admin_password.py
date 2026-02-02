"""
Quick script to reset admin password in MongoDB
Run from backend directory: python reset_admin_password.py
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import bcrypt

MONGO_URI = "mongodb://localhost:27017/tulip_crm"
NEW_PASSWORD = "Admin@123"

def hash_password(password: str) -> str:
    password_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')

async def reset_password():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client.tulip_crm

    new_hash = hash_password(NEW_PASSWORD)

    result = await db.users.update_one(
        {"email": "admin@tulip.com"},
        {"$set": {"password_hash": new_hash}}
    )

    if result.modified_count > 0:
        print(f"Password reset successfully for admin@tulip.com")
        print(f"New password: {NEW_PASSWORD}")
    else:
        print("No user found with email admin@tulip.com")

    client.close()

if __name__ == "__main__":
    asyncio.run(reset_password())
