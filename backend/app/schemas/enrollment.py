"""
Enrollment Schemas for request/response validation
"""
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from app.models.lead import Trimester, ServicePartner, ServiceEnrolled
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
    # Optional - subscriber name
    subscriber_name: Optional[str] = Field(None, max_length=200)

    # At least one of these must be provided: email, uhid, or phone_number
    email: Optional[EmailStr] = None
    uhid: Optional[str] = Field(None, max_length=50)
    phone_number: Optional[str] = Field(None, min_length=10, max_length=10)

    # Optional fields
    employee_id: Optional[str] = Field(None, max_length=50)
    billed_date: Optional[date] = None
    package_billed: Optional[str] = None
    hclhc_spoc: Optional[str] = None
    hcl_facility: Optional[str] = None
    doctor_name: Optional[str] = None
    dob: Optional[date] = None
    name: Optional[str] = None
    address: Optional[str] = None
    trimester: Optional[Trimester] = None
    service_enrolled: Optional[str] = None
    package_name_enrolled: Optional[str] = None
    service_partner: Optional[str] = None
    partner_centre_selected: Optional[str] = None
    partner_gynaecologist: Optional[str] = None
    connect_status: Optional[ConnectStatus] = None
    action_taken: Optional[ActionTaken] = None
    follow_up_date: Optional[datetime] = None
    next_follow_up_date: Optional[datetime] = None
    customer_feedback: Optional[str] = None
    remarks: Optional[str] = None
    assigned_to: Optional[str] = None

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v):
        if v is None:
            return v
        if not v.isdigit():
            raise ValueError("Phone number must contain only digits")
        if len(v) != 10:
            raise ValueError("Phone number must be 10 digits")
        if v[0] not in "6789":
            raise ValueError("Phone number must start with 6, 7, 8, or 9")
        return v

    @model_validator(mode='after')
    def check_at_least_one_identifier(self):
        """Ensure at least one of email, uhid, or phone_number is provided"""
        if not self.email and not self.uhid and not self.phone_number:
            raise ValueError("At least one of Email, UHID, or Phone Number must be provided")
        return self


class EnrollmentUpdateRequest(BaseModel):
    """Enrollment update request schema"""
    # All fields optional for partial updates
    subscriber_name: Optional[str] = None
    employee_id: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[EmailStr] = None
    billed_date: Optional[date] = None
    package_billed: Optional[str] = None
    hclhc_spoc: Optional[str] = None
    hcl_facility: Optional[str] = None
    doctor_name: Optional[str] = None
    uhid: Optional[str] = None
    dob: Optional[date] = None
    name: Optional[str] = None
    address: Optional[str] = None
    trimester: Optional[Trimester] = None
    service_enrolled: Optional[str] = None
    package_name_enrolled: Optional[str] = None
    service_partner: Optional[str] = None
    partner_centre_selected: Optional[str] = None
    partner_gynaecologist: Optional[str] = None
    connect_status: Optional[ConnectStatus] = None
    action_taken: Optional[ActionTaken] = None
    follow_up_date: Optional[datetime] = None
    next_follow_up_date: Optional[datetime] = None
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
    hcl_facility: Optional[str] = None
    doctor_name: Optional[str] = None

    # User Details
    uhid: Optional[str] = None
    subscriber_name: Optional[str] = None
    dob: Optional[date] = None
    employee_id: Optional[str] = None
    name: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None

    # Service Details
    trimester: Optional[str] = None
    service_enrolled: Optional[str] = None
    package_name_enrolled: Optional[str] = None
    service_partner: Optional[str] = None
    partner_centre_selected: Optional[str] = None
    partner_gynaecologist: Optional[str] = None

    # Status
    connect_status: Optional[str] = None
    action_taken: Optional[str] = None

    # Follow-up Tracking
    follow_up_date: Optional[datetime] = None
    next_follow_up_date: Optional[datetime] = None
    customer_feedback: Optional[str] = None
    remarks: Optional[str] = None

    # Follow-ups History
    follow_ups: List[dict] = []

    # Care Journey (snapshot + controls + agent trigger hints)
    journey: List[dict] = []
    journey_status: Optional[str] = "active"
    journey_stopped_reason: Optional[str] = None
    journey_stopped_by_name: Optional[str] = None
    journey_stopped_at: Optional[datetime] = None
    journey_flag: Optional[str] = None
    journey_flag_note: Optional[str] = None
    journey_classification: Optional[str] = None
    converted_to_lead_id: Optional[str] = None
    do_not_contact: bool = False
    dnc_reason: Optional[str] = None
    journey_triggers: Optional[dict] = None

    # Assignment
    assigned_to: Optional[str] = None
    assigned_to_name: Optional[str] = None
    assigned_date: Optional[datetime] = None
    reassigned_to: Optional[str] = None
    reassigned_to_name: Optional[str] = None
    reassigned_date: Optional[datetime] = None

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
    new_today: int = 0
    assigned_today: int = 0  # For agents: enrollments assigned/reassigned to them today
    follow_up_today: int = 0  # For agents: enrollments with follow-up required today
    by_partner: Dict[str, int]
    by_status: Dict[str, int]


class BulkUploadResponse(BaseModel):
    """Bulk upload response"""
    success: bool
    message: str
    total_rows: int
    created: int
    errors: List[Dict[str, Any]]
