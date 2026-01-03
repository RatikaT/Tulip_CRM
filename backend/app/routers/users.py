"""
User Management Routes (Admin Only)
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import Optional
from datetime import datetime
from app.schemas.user import (
    UserCreate,
    UserUpdate,
    UserResponse,
    UserListResponse,
    ResetPasswordRequest
)
from app.models.user import User, UserRole
from app.middleware.auth_middleware import get_current_user, require_admin
from app.services.auth_service import hash_password
import logging
import re

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("", response_model=UserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(require_admin)
):
    """
    List all users (Admin only)
    """
    # Build query
    query = {}

    if role:
        query["role"] = role
    if is_active is not None:
        query["is_active"] = is_active

    # Get total count
    if query:
        total = await User.find(query).count()
    else:
        total = await User.count()

    # Build the find query
    if query:
        users_query = User.find(query)
    else:
        users_query = User.find_all()

    # Apply search filter if provided (escape regex special chars for security)
    if search:
        escaped_search = re.escape(search)
        users_query = User.find({
            "$or": [
                {"username": {"$regex": escaped_search, "$options": "i"}},
                {"email": {"$regex": escaped_search, "$options": "i"}},
                {"full_name": {"$regex": escaped_search, "$options": "i"}}
            ]
        })
        total = await users_query.count()

    # Apply pagination
    skip = (page - 1) * page_size
    users = await users_query.skip(skip).limit(page_size).to_list()

    return {
        "users": [
            {
                "id": str(u.id),
                "username": u.username,
                "email": u.email,
                "full_name": u.full_name,
                "role": u.role,
                "is_active": u.is_active,
                "crm_types": u.crm_types,
                "created_at": u.created_at,
                "updated_at": u.updated_at,
                "last_login": u.last_login,
                "login_count": u.login_count
            }
            for u in users
        ],
        "total": total,
        "page": page,
        "page_size": page_size
    }


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    current_user: dict = Depends(require_admin)
):
    """
    Get a specific user by ID (Admin only)
    """
    from bson import ObjectId

    if not ObjectId.is_valid(user_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format"
        )

    user = await User.get(user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return {
        "id": str(user.id),
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "is_active": user.is_active,
        "crm_types": user.crm_types,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "last_login": user.last_login,
        "login_count": user.login_count
    }


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    current_user: dict = Depends(require_admin)
):
    """
    Create a new user (Admin only)
    """
    logger.debug(f"Creating user: username={user_data.username}, email={user_data.email}, by admin={current_user['email']}")
    # Check if username already exists
    existing_username = await User.find_one(User.username == user_data.username)
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists"
        )

    # Check if email already exists
    existing_email = await User.find_one(User.email == user_data.email)
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already exists"
        )

    # Create user
    user = User(
        username=user_data.username,
        email=user_data.email,
        full_name=user_data.full_name,
        password_hash=hash_password(user_data.password),
        role=UserRole(user_data.role),
        is_active=user_data.is_active,
        crm_types=user_data.crm_types,
        created_by=current_user["user_id"]
    )

    await user.insert()

    logger.info(f"User created: {user.email} by {current_user['email']}")

    return {
        "id": str(user.id),
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "is_active": user.is_active,
        "crm_types": user.crm_types,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "last_login": user.last_login,
        "login_count": user.login_count
    }


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    user_data: UserUpdate,
    current_user: dict = Depends(require_admin)
):
    """
    Update a user (Admin only)
    """
    logger.debug(f"Updating user {user_id} by admin={current_user['email']}")
    from bson import ObjectId

    if not ObjectId.is_valid(user_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format"
        )

    user = await User.get(user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Check username uniqueness if changing
    if user_data.username and user_data.username != user.username:
        existing = await User.find_one(User.username == user_data.username)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already exists"
            )
        user.username = user_data.username

    # Check email uniqueness if changing
    if user_data.email and user_data.email != user.email:
        existing = await User.find_one(User.email == user_data.email)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already exists"
            )
        user.email = user_data.email

    # Update other fields
    if user_data.full_name is not None:
        user.full_name = user_data.full_name
    password_updated = False
    if user_data.password:
        logger.info(f"Updating password for user: {user.email}, new password length: {len(user_data.password)}")
        new_hash = hash_password(user_data.password)
        logger.info(f"New password hash: {new_hash[:20]}...")
        user.password_hash = new_hash
        password_updated = True
    else:
        logger.info(f"No password update for user: {user.email}, password value: {user_data.password}")
    if user_data.role is not None:
        user.role = UserRole(user_data.role)
    if user_data.is_active is not None:
        user.is_active = user_data.is_active
    if user_data.crm_types is not None:
        user.crm_types = user_data.crm_types

    user.updated_at = datetime.utcnow()
    await user.save()

    # Verify password was saved (debug)
    if password_updated:
        updated_user = await User.get(user_id)
        logger.info(f"Password hash after save: {updated_user.password_hash[:20]}...")

    logger.info(f"User updated: {user.email} by {current_user['email']}")

    return {
        "id": str(user.id),
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "is_active": user.is_active,
        "crm_types": user.crm_types,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "last_login": user.last_login,
        "login_count": user.login_count
    }


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    current_user: dict = Depends(require_admin)
):
    """
    Deactivate a user (Admin only) - soft delete
    """
    logger.debug(f"Deleting/deactivating user {user_id} by admin={current_user['email']}")
    from bson import ObjectId

    if not ObjectId.is_valid(user_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format"
        )

    user = await User.get(user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Prevent self-deactivation
    if str(user.id) == current_user["user_id"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account"
        )

    # Soft delete - just deactivate
    user.is_active = False
    user.updated_at = datetime.utcnow()
    await user.save()

    logger.info(f"User deactivated: {user.email} by {current_user['email']}")

    return {"message": "User deactivated successfully"}


@router.post("/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    request: ResetPasswordRequest,
    current_user: dict = Depends(require_admin)
):
    """
    Reset a user's password (Admin only)
    """
    from bson import ObjectId

    if not ObjectId.is_valid(user_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format"
        )

    user = await User.get(user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    user.password_hash = hash_password(request.new_password)
    user.updated_at = datetime.utcnow()
    await user.save()

    logger.info(f"Password reset for user: {user.email} by {current_user['email']}")

    return {"message": "Password reset successfully"}
