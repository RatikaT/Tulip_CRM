"""
User Model for Admin and Agent accounts
"""
from datetime import datetime
from typing import Optional, List
from beanie import Document, Indexed
from pydantic import EmailStr, Field
from enum import Enum


class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    AGENT = "agent"


class User(Document):
    """User document model"""

    username: Indexed(str, unique=True)
    email: Indexed(EmailStr, unique=True)
    full_name: str
    password_hash: str
    role: UserRole = UserRole.AGENT
    is_active: bool = True

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_login: Optional[datetime] = None
    login_count: int = 0

    # Created by (for admin-created users)
    created_by: Optional[str] = None

    # CRM types user has access to (e.g., ["tulip", "health_compass"])
    crm_types: List[str] = Field(default_factory=list)

    class Settings:
        name = "users"
        use_state_management = True

    class Config:
        json_schema_extra = {
            "example": {
                "username": "john_doe",
                "email": "john@tulip.com",
                "full_name": "John Doe",
                "role": "agent",
                "is_active": True,
                "crm_types": ["tulip"]
            }
        }
