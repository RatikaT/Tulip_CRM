"""
Enrollment Schemas for request/response validation
"""
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from app.models.lead import Trimester, ServicePartner
from app.models.enrollment import ConnectStatus, ActionTaken


class FollowUpEntrySchema(BaseModel):
    """Follow-up entry schema"""
    follow_up_number: int
    date: Optional[datetime] = None
    connect_status: Optional[str] = None
    action_taken: Optional[str] = None
    feedback: Optional[str] = None
    remarks: Optional[str] = None
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: Optional[datetime] = None


class FollowUpCreateRequest(BaseModel):
    """Request to add a follow-up entry"""
    connect_status: Optional[ConnectStatus] = None
    action_taken: Optional[ActionTaken] = None
    feedback: Optional[str] = Field(None, max_length=2000)
    remarks: Optional[str] = Field(None, max_length=2000)
    follow_up_date: Optional[datetime] = None


class EnrollmentCreateRequest(BaseModel):
    """Enrollment creation request schema"""
    # Mandatory fields
    subscriber_name: str = Field(..., min_length=1, max_length=200)
    employee_code: str = Field(..., min_length=1, max_length=50)
    phone_number: str = Field(..., min_length=10, max_length=10)

    # Optional fields
    email: Optional[EmailStr] = None
    billed_date: Optional[date] = None
    package_billed: Optional[str] = None
    hclhc_spoc: Optional[str] = None
    hcl_location: Optional[str] = None
    hclhc_doctor: Optional[str] = None
    uhid: Optional[str] = None
    dob: Optional[date] = None
    employee_name: Optional[str] = None
    address: Optional[str] = None
    trimester: Optional[Trimester] = None
    service_partner: Optional[ServicePartner] = None
    partner_centre_selected: Optional[str] = None
    partner_gynaecologist: Optional[str] = None
    connect_status: Optional[ConnectStatus] = None
    action_taken: Optional[ActionTaken] = None
    follow_up_date: Optional[datetime] = None
    customer_feedback: Optional[str] = None
    remarks: Optional[str] = None
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


class EnrollmentUpdateRequest(BaseModel):
    """Enrollment update request schema"""
    # All fields optional for partial updates
    subscriber_name: Optional[str] = None
    employee_code: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[EmailStr] = None
    billed_date: Optional[date] = None
    package_billed: Optional[str] = None
    hclhc_spoc: Optional[str] = None
    hcl_location: Optional[str] = None
    hclhc_doctor: Optional[str] = None
    uhid: Optional[str] = None
    dob: Optional[date] = None
    employee_name: Optional[str] = None
    address: Optional[str] = None
    trimester: Optional[Trimester] = None
    service_partner: Optional[ServicePartner] = None
    partner_centre_selected: Optional[str] = None
    partner_gynaecologist: Optional[str] = None
    connect_status: Optional[ConnectStatus] = None
    action_taken: Optional[ActionTaken] = None
    follow_up_date: Optional[datetime] = None
    customer_feedback: Optional[str] = None
    remarks: Optional[str] = None
    assigned_to: Optional[str] = None
    assigned_to_name: Optional[str] = None


class EnrollmentResponse(BaseModel):
    """Enrollment response schema"""
    id: str
    enrollment_id: str
    linked_lead_id: Optional[str] = None

    # Timestamps
    created_at: datetime
    updated_at: datetime

    # Billing Info
    billed_date: Optional[date] = None
    package_billed: Optional[str] = None

    # HCLH Details
    hclhc_spoc: Optional[str] = None
    hcl_location: Optional[str] = None
    hclhc_doctor: Optional[str] = None

    # User Details
    uhid: Optional[str] = None
    subscriber_name: str
    dob: Optional[date] = None
    employee_code: Optional[str] = None
    employee_name: Optional[str] = None
    phone_number: str
    email: Optional[str] = None
    address: Optional[str] = None

    # Service Details
    trimester: Optional[str] = None
    service_partner: Optional[str] = None
    partner_centre_selected: Optional[str] = None
    partner_gynaecologist: Optional[str] = None

    # Status
    connect_status: Optional[str] = None
    action_taken: Optional[str] = None

    # Follow-up Tracking
    follow_up_date: Optional[datetime] = None
    customer_feedback: Optional[str] = None
    remarks: Optional[str] = None

    # Follow-ups History
    follow_ups: List[dict] = []

    # Assignment
    assigned_to: Optional[str] = None
    assigned_to_name: Optional[str] = None

    # System
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None

    class Config:
        from_attributes = True


class EnrollmentListResponse(BaseModel):
    """Enrollment list response with pagination"""
    enrollments: List[EnrollmentResponse]
    total: int
    page: int
    per_page: int
    pages: int


class EnrollmentStatsResponse(BaseModel):
    """Enrollment stats response"""
    total: int
    by_partner: Dict[str, int]
    by_status: Dict[str, int]


class BulkUploadResponse(BaseModel):
    """Bulk upload response"""
    success: bool
    message: str
    total_rows: int
    created: int
    errors: List[Dict[str, Any]]
