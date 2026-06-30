"""
Journey Templates (Care + Outreach).

A super-admin-defined follow-up journey ("pathway") keyed by a composite
(context, trigger_key):

  - context = "care"     -> worked by the AGENT for an enrolled customer.
      trigger_key = service: "PreConception" | "Antenatal" | "MaternityWellness"
  - context = "outreach" -> worked centrally by ADMIN for a (closed) lead.
      trigger_key = "<LeadStatus>::<service>" for service-specific, or
                    "<LeadStatus>::GENERIC" for the unknown-service template.

There is ONE template per (context, trigger_key) — composite unique index.

When the trigger fires (enrollment created, or lead closed) the matching template
is SNAPSHOTTED onto the document (Lead.journey / Enrollment.journey) as a flat,
dated checklist. Editing a template only affects FUTURE journeys (snapshot model).
"""
from datetime import datetime
from typing import Optional, List
from beanie import Document
from pydantic import BaseModel, Field
from enum import Enum


class JourneyContext(str, Enum):
    CARE = "care"
    OUTREACH = "outreach"


class StepType(str, Enum):
    CALL = "Call"
    EMAIL = "Email"          # used as "Mail" for outreach
    WHATSAPP = "WhatsApp"
    APPOINTMENT = "Appointment"
    LAB = "Lab"
    OTHER = "Other"


# Sentinel used in trigger_key when the lead's service is unknown/off-list.
GENERIC_SERVICE = "GENERIC"

# The 3 standardized care services.
CARE_SERVICES = ["Antenatal", "PreConception", "MaternityWellness"]


def _enum_value(v) -> str:
    """Coerce a value (possibly a str-Enum like LeadStatus) to its plain string.

    Needed because f-string formatting of a (str, Enum) member yields
    'LeadStatus.NOT_INTERESTED' on Python 3.11+, not the value 'Not Interested'.
    """
    if v is None:
        return ""
    return str(v.value) if hasattr(v, "value") else str(v)


def make_outreach_key(status, service) -> str:
    """Build an outreach trigger_key: '<status>::<service>' or '<status>::GENERIC'."""
    st = _enum_value(status).strip()
    svc = _enum_value(service).strip()
    if svc not in CARE_SERVICES:
        svc = GENERIC_SERVICE
    return f"{st}::{svc}"


class JourneyStepDef(BaseModel):
    """A single step in a template."""
    step_id: str                              # stable id within the template
    name: str                                 # e.g. "Welcome mailer / call"
    description: Optional[str] = None
    step_type: str = StepType.OTHER.value
    offset_days: int = 0                       # first occurrence = anchor + offset_days
    order: int = 0                             # display / sequence order

    # Recurrence (materialized into concrete dated instances at build time).
    recurrence_days: Optional[int] = None      # e.g. 30 = every 30 days; None = one-off
    recurrence_count: Optional[int] = None     # fixed number of repeats; None = horizon-driven
    horizon: Optional[str] = None              # "trimester" | None (Antenatal loops to delivery)
    is_optional: bool = False                  # clearly-labelled, freely-skippable touchpoint


class JourneyTemplate(Document):
    """One journey template per (context, trigger_key)."""

    context: str = JourneyContext.CARE.value
    trigger_key: str                           # service (care) or "<status>::<service>" (outreach)

    steps: List[JourneyStepDef] = Field(default_factory=list)

    updated_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by: Optional[str] = None
    updated_by_name: Optional[str] = None

    class Settings:
        name = "journey_templates"
        # NOTE: the (context, trigger_key) unique index is created in the startup
        # migration (journey_seed.migrate_and_seed_journeys) AFTER legacy docs are
        # given context/trigger_key — letting Beanie auto-create it here would crash
        # on startup because legacy docs share (null, null) until migrated.

    class Config:
        json_schema_extra = {
            "example": {
                "context": "care",
                "trigger_key": "PreConception",
                "steps": [
                    {"step_id": "s1", "name": "Welcome mailer / call",
                     "step_type": "Email", "offset_days": 0, "order": 0},
                    {"step_id": "s2", "name": "Keep-in-touch call",
                     "step_type": "Call", "offset_days": 30, "order": 4,
                     "recurrence_days": 30, "recurrence_count": 12},
                ],
            }
        }
