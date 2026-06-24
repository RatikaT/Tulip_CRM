"""
Care Journey Templates.

A super-admin-defined, per-service follow-up journey ("care pathway"). Each
service (PreConception / Antenatal / MaternityWellness) has ONE template made of
ordered steps. When a lead is enrolled, the active template for its service is
snapshotted onto the enrollment as a working checklist (see Enrollment.journey).

Editing a template only affects FUTURE enrollments — existing customers keep the
journey they were given (snapshot model).
"""
from datetime import datetime
from typing import Optional, List
from beanie import Document, Indexed
from pydantic import BaseModel, Field
from enum import Enum


class StepType(str, Enum):
    CALL = "Call"
    EMAIL = "Email"
    APPOINTMENT = "Appointment"
    LAB = "Lab"
    OTHER = "Other"


class JourneyStepDef(BaseModel):
    """A single step in a service's journey template."""
    step_id: str                       # stable id within the template
    name: str                          # e.g. "Welcome mailer / call"
    description: Optional[str] = None
    step_type: str = StepType.OTHER.value
    offset_days: int = 0               # planned date = enrollment date + offset_days
    order: int = 0                     # display / sequence order


class JourneyTemplate(Document):
    """One care-journey template per service."""

    # The standardized service this journey belongs to (one template per service)
    service: Indexed(str, unique=True)

    steps: List[JourneyStepDef] = Field(default_factory=list)

    updated_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by: Optional[str] = None
    updated_by_name: Optional[str] = None

    class Settings:
        name = "journey_templates"

    class Config:
        json_schema_extra = {
            "example": {
                "service": "PreConception",
                "steps": [
                    {"step_id": "s1", "name": "Welcome mailer / call",
                     "step_type": "Call", "offset_days": 0, "order": 0},
                    {"step_id": "s2", "name": "Book doctor appointment",
                     "step_type": "Appointment", "offset_days": 3, "order": 1},
                    {"step_id": "s3", "name": "Lab sample collection",
                     "step_type": "Lab", "offset_days": 7, "order": 2},
                ],
            }
        }
