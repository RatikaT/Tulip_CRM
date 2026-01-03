"""
Lead Schemas for request/response validation
"""
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from app.models.lead import LeadStatus, LeadSource, Trimester, LookingFor, ServiceEnrolled, ServicePartner, ReasonForNoSale


class CallEntrySchema(BaseModel):
    """Call entry schema"""
    call_number: int
    date_time: Optional[datetime] = None
    summary: Optional[str] = None


class CommentSchema(BaseModel):
    """Comment schema"""
    text: str
    created_at: datetime
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None


class CommentCreateRequest(BaseModel):
    """Request to add a comment"""
    text: str = Field(..., min_length=1, max_length=2000)


class LeadCreateRequest(BaseModel):
    """Lead creation request schema - Admin only"""
    # Mandatory fields
    lead_source: LeadSource
    lead_creation_date: Optional[date] = None
    name: str = Field(..., min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    phone_number: str = Field(..., min_length=10, max_length=10)
    alternate_mobile_number: Optional[str] = None

    # Optional fields
    employee_id: Optional[str] = None
    uhid: Optional[str] = None
    user_facility: Optional[str] = None
    city: Optional[str] = None
    pin_code: Optional[str] = None
    address: Optional[str] = None
    trimester: Optional[Trimester] = None
    looking_for: Optional[LookingFor] = None
    family_member_relation: Optional[str] = None
    package_requested: Optional[str] = None
    service_enrolled: Optional[ServiceEnrolled] = None
    package_name_enrolled: Optional[str] = None
    service_partner: Optional[ServicePartner] = None
    provider_location: Optional[str] = None
    hclhc_spoc: Optional[str] = None
    reason_for_no_sale: Optional[ReasonForNoSale] = None
    doctor_name: Optional[str] = None
    consult_date: Optional[date] = None
    follow_up_date: Optional[datetime] = None
    assigned_to: Optional[str] = None

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v):
        if not v.isdigit():
            raise ValueError("Phone number must contain only digits")
        if len(v) != 10:
            raise ValueError("Phone number must be 10 digits")
        if v[0] not in "6789":
            raise ValueError("Phone number must start with 6, 7, 8, or 9")
        return v


class LeadUpdateRequest(BaseModel):
    """Lead update request schema - Role-based field restrictions apply"""
    # Agent editable fields
    lead_source: Optional[LeadSource] = None
    lead_creation_date: Optional[date] = None
    status: Optional[LeadStatus] = None
    number_of_calls: Optional[int] = None
    calls: Optional[List[CallEntrySchema]] = None
    follow_up_date: Optional[datetime] = None

    # Admin-only editable fields (validated in router)
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone_number: Optional[str] = None
    alternate_mobile_number: Optional[str] = None
    employee_id: Optional[str] = None
    uhid: Optional[str] = None
    user_facility: Optional[str] = None
    city: Optional[str] = None
    pin_code: Optional[str] = None
    address: Optional[str] = None
    trimester: Optional[Trimester] = None
    looking_for: Optional[LookingFor] = None
    family_member_relation: Optional[str] = None
    package_requested: Optional[str] = None
    service_enrolled: Optional[ServiceEnrolled] = None
    package_name_enrolled: Optional[str] = None
    service_partner: Optional[ServicePartner] = None
    provider_location: Optional[str] = None
    hclhc_spoc: Optional[str] = None
    reason_for_no_sale: Optional[ReasonForNoSale] = None
    doctor_name: Optional[str] = None
    consult_date: Optional[date] = None
    assigned_to: Optional[str] = None
    assigned_to_name: Optional[str] = None


class LeadResponse(BaseModel):
    """Lead response schema"""
    id: str
    lead_id: str

    # Timestamps
    created_at: datetime
    updated_at: datetime

    # Lead Source and Status
    lead_source: Optional[str] = None
    lead_creation_date: Optional[date] = None
    status: str

    # User Details
    name: str
    email: Optional[str] = None
    phone_number: str
    alternate_mobile_number: Optional[str] = None
    employee_id: Optional[str] = None
    uhid: Optional[str] = None

    # Location Details
    user_facility: Optional[str] = None
    city: Optional[str] = None
    pin_code: Optional[str] = None
    address: Optional[str] = None

    # Lead Information
    trimester: Optional[str] = None
    looking_for: Optional[str] = None
    family_member_relation: Optional[str] = None
    package_requested: Optional[str] = None

    # Service Details
    service_enrolled: Optional[str] = None
    package_name_enrolled: Optional[str] = None
    service_partner: Optional[str] = None
    provider_location: Optional[str] = None
    hclhc_spoc: Optional[str] = None

    # Reason for No Sale
    reason_for_no_sale: Optional[str] = None

    # Doctor/Consultation Details
    doctor_name: Optional[str] = None
    consult_date: Optional[date] = None

    # Call Tracking
    number_of_calls: int
    calls: List[dict]
    follow_up_date: Optional[datetime] = None

    # Assignment
    assigned_to: Optional[str] = None
    assigned_to_name: Optional[str] = None

    # Comments
    comments: List[dict] = []

    # System
    created_by: Optional[str] = None

    class Config:
        from_attributes = True


class LeadListResponse(BaseModel):
    """Lead list response with pagination"""
    leads: List[LeadResponse]
    total: int
    page: int
    per_page: int
    pages: int
