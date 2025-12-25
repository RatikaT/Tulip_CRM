"""
User Schemas for CRUD operations
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime


class UserCreate(BaseModel):
    """Schema for creating a new user"""
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=100)
    password: str = Field(..., min_length=8)
    role: str = Field(default="agent", pattern="^(super_admin|admin|agent)$")
    is_active: bool = True
    crm_types: List[str] = Field(default_factory=list)


class UserUpdate(BaseModel):
    """Schema for updating a user"""
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    email: Optional[EmailStr] = None
    full_name: Optional[str] = Field(None, min_length=2, max_length=100)
    password: Optional[str] = Field(None, min_length=8)
    role: Optional[str] = Field(None, pattern="^(super_admin|admin|agent)$")
    is_active: Optional[bool] = None
    crm_types: Optional[List[str]] = None


class UserResponse(BaseModel):
    """Schema for user response"""
    id: str
    username: str
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    crm_types: List[str] = []
    created_at: datetime
    updated_at: datetime
    last_login: Optional[datetime] = None
    login_count: int = 0

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    """Schema for list of users"""
    users: list[UserResponse]
    total: int
    page: int
    page_size: int


class ResetPasswordRequest(BaseModel):
    """Schema for admin password reset"""
    new_password: str = Field(..., min_length=8)
