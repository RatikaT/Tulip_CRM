"""
Custom Field Model for admin-defined dynamic fields
"""
from datetime import datetime
from typing import Optional, List
from beanie import Document, Indexed
from pydantic import Field
from enum import Enum


class FieldType(str, Enum):
    TEXT = "text"
    NUMBER = "number"
    DROPDOWN = "dropdown"
    DATE = "date"
    CHECKBOX = "checkbox"
    TEXTAREA = "textarea"


class CustomField(Document):
    """Admin-defined custom field for leads"""

    field_name: Indexed(str, unique=True)
    field_label: str
    field_type: FieldType
    is_required: bool = False
    dropdown_options: List[str] = Field(default_factory=list)
    visible_to_agents: bool = True
    display_order: int = 0
    is_active: bool = True

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None

    class Settings:
        name = "custom_fields"

    class Config:
        json_schema_extra = {
            "example": {
                "field_name": "insurance_provider",
                "field_label": "Insurance Provider",
                "field_type": "dropdown",
                "is_required": False,
                "dropdown_options": ["Provider A", "Provider B", "Provider C"],
                "visible_to_agents": True,
                "display_order": 1
            }
        }
