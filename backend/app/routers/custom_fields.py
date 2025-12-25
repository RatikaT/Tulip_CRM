"""
Custom Fields Router
CRUD operations for admin-defined custom fields
"""
from fastapi import APIRouter, HTTPException, status, Depends
from typing import Optional
from datetime import datetime
import logging

from app.models.custom_field import CustomField, FieldType
from app.schemas.custom_field import (
    CustomFieldCreate,
    CustomFieldUpdate,
    CustomFieldResponse,
    CustomFieldListResponse,
)
from app.middleware.auth_middleware import get_current_admin, get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


def field_to_response(field: CustomField) -> CustomFieldResponse:
    """Convert CustomField document to response schema"""
    return CustomFieldResponse(
        id=str(field.id),
        field_name=field.field_name,
        field_label=field.field_label,
        field_type=field.field_type.value,
        is_required=field.is_required,
        dropdown_options=field.dropdown_options,
        visible_to_agents=field.visible_to_agents,
        display_order=field.display_order,
        is_active=field.is_active,
        created_at=field.created_at,
        updated_at=field.updated_at,
        created_by=field.created_by,
    )


@router.post("", response_model=CustomFieldResponse)
async def create_custom_field(
    field_data: CustomFieldCreate,
    current_user: dict = Depends(get_current_admin)
):
    """Create a new custom field (Admin only)"""
    # Check if field_name already exists
    existing = await CustomField.find_one(CustomField.field_name == field_data.field_name)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Field with name '{field_data.field_name}' already exists"
        )

    # Validate dropdown options for dropdown type
    if field_data.field_type == FieldType.DROPDOWN and not field_data.dropdown_options:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dropdown fields must have at least one option"
        )

    # Create field
    field = CustomField(
        field_name=field_data.field_name,
        field_label=field_data.field_label,
        field_type=field_data.field_type,
        is_required=field_data.is_required,
        dropdown_options=field_data.dropdown_options,
        visible_to_agents=field_data.visible_to_agents,
        display_order=field_data.display_order,
        created_by=current_user["user_id"],
    )
    await field.insert()

    logger.info(f"Custom field created: {field.field_name} by {current_user['full_name']}")

    return field_to_response(field)


@router.get("", response_model=CustomFieldListResponse)
async def list_custom_fields(
    active_only: bool = True,
    current_user: dict = Depends(get_current_user)
):
    """List all custom fields"""
    is_admin = current_user.get("role") in ["admin", "super_admin"]

    query = {}

    # Filter active only if requested
    if active_only:
        query["is_active"] = True

    # Agents can only see fields visible to them
    if not is_admin:
        query["visible_to_agents"] = True

    fields = await CustomField.find(query).sort([("display_order", 1), ("created_at", 1)]).to_list()

    return CustomFieldListResponse(
        fields=[field_to_response(f) for f in fields],
        total=len(fields)
    )


@router.get("/{field_id}", response_model=CustomFieldResponse)
async def get_custom_field(
    field_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific custom field"""
    field = await CustomField.get(field_id)

    if not field:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom field not found"
        )

    # Check visibility for agents
    is_admin = current_user.get("role") in ["admin", "super_admin"]
    if not is_admin and not field.visible_to_agents:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )

    return field_to_response(field)


@router.put("/{field_id}", response_model=CustomFieldResponse)
async def update_custom_field(
    field_id: str,
    update_data: CustomFieldUpdate,
    current_user: dict = Depends(get_current_admin)
):
    """Update a custom field (Admin only)"""
    field = await CustomField.get(field_id)

    if not field:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom field not found"
        )

    # Update fields
    if update_data.field_label is not None:
        field.field_label = update_data.field_label
    if update_data.is_required is not None:
        field.is_required = update_data.is_required
    if update_data.dropdown_options is not None:
        # Validate for dropdown type
        if field.field_type == FieldType.DROPDOWN and not update_data.dropdown_options:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Dropdown fields must have at least one option"
            )
        field.dropdown_options = update_data.dropdown_options
    if update_data.visible_to_agents is not None:
        field.visible_to_agents = update_data.visible_to_agents
    if update_data.display_order is not None:
        field.display_order = update_data.display_order
    if update_data.is_active is not None:
        field.is_active = update_data.is_active

    field.updated_at = datetime.utcnow()
    await field.save()

    logger.info(f"Custom field updated: {field.field_name} by {current_user['full_name']}")

    return field_to_response(field)


@router.delete("/{field_id}")
async def delete_custom_field(
    field_id: str,
    current_user: dict = Depends(get_current_admin)
):
    """Delete a custom field (Admin only)"""
    field = await CustomField.get(field_id)

    if not field:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom field not found"
        )

    await field.delete()

    logger.info(f"Custom field deleted: {field.field_name} by {current_user['full_name']}")

    return {"message": "Custom field deleted successfully"}
