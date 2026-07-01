"""
Field Configuration (super-admin managed).

Per-field settings for a curated set of Lead and Enrollment form fields:
  - input_type: "text" | "dropdown"  (SA can convert a text field to a dropdown)
  - required:   bool                  (SA can make a field mandatory/optional)
  - options:    list[str]             (choices when input_type == "dropdown")

This is ADDITIVE to the hardcoded rules (mandatory reason-on-Not-Interested and
the mandatory enrollment-create set stay enforced regardless). The unique
(form, field_name) key is managed via upsert in the router (no DB unique index,
to avoid startup index issues on legacy docs).
"""
from datetime import datetime
from typing import Optional, List
from beanie import Document
from pydantic import BaseModel, Field
from enum import Enum


class FormKind(str, Enum):
    LEAD = "lead"
    ENROLLMENT = "enrollment"


class InputType(str, Enum):
    TEXT = "text"
    DROPDOWN = "dropdown"


class FieldConfig(Document):
    form: str                      # "lead" | "enrollment"
    field_name: str
    label: str
    input_type: str = InputType.TEXT.value
    required: bool = False
    options: List[str] = Field(default_factory=list)
    order: int = 0

    updated_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by: Optional[str] = None
    updated_by_name: Optional[str] = None

    class Settings:
        name = "field_configs"


class FieldConfigItem(BaseModel):
    """Curated-field default (used to seed + list what's configurable)."""
    field_name: str
    label: str
    input_type: str = InputType.TEXT.value
    options: List[str] = []


# Curated set of configurable fields per form (kept intentionally small + safe:
# free-text / choice fields only — not dates/phones/system fields).
CURATED_FIELDS = {
    "lead": [
        FieldConfigItem(field_name="lead_source", label="Lead Source", input_type="dropdown"),
        FieldConfigItem(field_name="service_requested", label="Service Requested", input_type="dropdown"),
        FieldConfigItem(field_name="package_requested", label="Package Requested"),
        FieldConfigItem(field_name="reason_for_no_sale", label="Reason for No Sale", input_type="dropdown"),
        FieldConfigItem(field_name="city", label="City"),
        FieldConfigItem(field_name="doctor_name", label="Doctor Name"),
        FieldConfigItem(field_name="doctor_speciality", label="Doctor Speciality"),
    ],
    "enrollment": [
        FieldConfigItem(field_name="service_partner", label="Service Partner", input_type="dropdown"),
        FieldConfigItem(field_name="package_billed", label="Package Billed"),
        FieldConfigItem(field_name="hcl_facility", label="HCL Facility"),
        FieldConfigItem(field_name="doctor_name", label="Doctor Name"),
        FieldConfigItem(field_name="partner_centre_selected", label="Partner Centre Selected"),
        FieldConfigItem(field_name="partner_gynaecologist", label="Partner Gynaecologist"),
    ],
}
