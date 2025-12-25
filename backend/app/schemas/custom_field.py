"""
Custom Field Schemas
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from app.models.custom_field import FieldType


class CustomFieldCreate(BaseModel):
    """Schema for creating a custom field"""
    field_name: str = Field(..., min_length=1, max_length=50, pattern=r'^[a-z][a-z0-9_]*$')
    field_label: str = Field(..., min_length=1, max_length=100)
    field_type: FieldType
    is_required: bool = False
    dropdown_options: List[str] = Field(default_factory=list)
    visible_to_agents: bool = True
    display_order: int = 0


class CustomFieldUpdate(BaseModel):
    """Schema for updating a custom field"""
    field_label: Optional[str] = Field(None, min_length=1, max_length=100)
    is_required: Optional[bool] = None
    dropdown_options: Optional[List[str]] = None
    visible_to_agents: Optional[bool] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None


class CustomFieldResponse(BaseModel):
    """Schema for custom field response"""
    id: str
    field_name: str
    field_label: str
    field_type: str
    is_required: bool
    dropdown_options: List[str]
    visible_to_agents: bool
    display_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None


class CustomFieldListResponse(BaseModel):
    """Schema for list of custom fields"""
    fields: List[CustomFieldResponse]
    total: int
