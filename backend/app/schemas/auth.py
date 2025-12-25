"""
Authentication Schemas
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List


class LoginRequest(BaseModel):
    """Login request schema"""
    email: EmailStr
    password: str = Field(..., min_length=8)


class LoginResponse(BaseModel):
    """Login response schema"""
    access_token: str
    token_type: str = "bearer"
    user: dict


class ChangePasswordRequest(BaseModel):
    """Change password request schema"""
    current_password: str = Field(..., min_length=8)
    new_password: str = Field(..., min_length=8)


class UserResponse(BaseModel):
    """User response schema"""
    id: str
    username: str
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    crm_types: List[str] = []

    class Config:
        from_attributes = True
