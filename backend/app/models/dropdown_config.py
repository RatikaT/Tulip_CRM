"""
DropdownConfig Model for storing configurable dropdown options
"""
from datetime import datetime
from typing import Optional, List, Dict
from beanie import Document, Indexed
from pydantic import Field


class DropdownConfig(Document):
    """Stores configurable dropdown options for the CRM system"""

    # Unique identifier for the dropdown field
    field_name: Indexed(str, unique=True)

    # Human-readable display name for admin UI
    display_name: str

    # Category for grouping (leads, enrollments, common)
    category: str

    # Simple list of dropdown options
    options: List[str] = Field(default_factory=list)

    # For conditional dropdowns - maps parent value to child options
    # e.g., {"Motherhood": ["Location 1", "Location 2"], "Rainbow": ["Location A", "Location B"]}
    conditional_options: Optional[Dict[str, List[str]]] = None

    # Whether this field depends on another field's value
    is_conditional: bool = False

    # If conditional, which field it depends on
    parent_field: Optional[str] = None

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "dropdown_configs"

    class Config:
        json_schema_extra = {
            "example": {
                "field_name": "lead_source",
                "display_name": "Lead Source",
                "category": "leads",
                "options": ["Call", "WhatsApp", "Email", "Website"],
                "is_conditional": False,
            }
        }
