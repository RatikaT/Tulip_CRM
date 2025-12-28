"""
Enrollment Model for CRM Enrollment Management
"""
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from beanie import Document, Indexed
from pydantic import Field, EmailStr, BaseModel
from enum import Enum

# Import shared enums from lead model
from app.models.lead import Trimester, ServicePartner


class ConnectStatus(str, Enum):
    CONNECTED = "Connected"
    NO_RESPONSE = "No Response"
    FOLLOW_UP_REQUIRED = "Follow Up Required"
    OTHERS = "Others"


class ActionTaken(str, Enum):
    APPOINTMENT_BOOKED = "Appointment Booked"
    FEEDBACK_TAKEN = "Feedback Taken"
    NO_ACTION_REQUIRED = "No Action Required"
    LIASONED_WITH_PARTNER = "Liasoned with Partner Team"


class FollowUpEntry(BaseModel):
    """Follow-up entry for tracking multiple follow-ups per enrollment"""
    follow_up_number: int
    date: Optional[datetime] = None
    connect_status: Optional[str] = None
    action_taken: Optional[str] = None
    feedback: Optional[str] = None
    remarks: Optional[str] = None
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Enrollment(Document):
    """Enrollment document model for tracking enrolled users"""

    # Auto-generated EnrollmentID: ENR_DDMMYYYY_XXX
    enrollment_id: Indexed(str, unique=True)

    # Linked Lead (if auto-created from lead)
    linked_lead_id: Optional[str] = None

    # System timestamps (auto-managed)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Billing Info
    billed_date: Optional[date] = None
    package_billed: Optional[str] = None

    # HCLH Details
    hclhc_spoc: Optional[str] = None
    hcl_location: Optional[str] = None

    # HCLH Doctor
    hclhc_doctor: Optional[str] = None

    # User Details (mandatory: subscriber_name, employee_code, phone_number)
    uhid: Optional[str] = None
    subscriber_name: str
    dob: Optional[date] = None
    employee_code: Optional[str] = None  # Primary identifier (can have multiple enrollments)
    employee_name: Optional[str] = None  # Employee/User Name
    phone_number: str
    email: Optional[EmailStr] = None
    address: Optional[str] = None

    # Service Details
    trimester: Optional[Trimester] = None
    service_partner: Optional[ServicePartner] = None
    partner_centre_selected: Optional[str] = None
    partner_gynaecologist: Optional[str] = None

    # Status (Dropdowns)
    connect_status: Optional[ConnectStatus] = None
    action_taken: Optional[ActionTaken] = None

    # Current Follow-up Tracking
    follow_up_date: Optional[datetime] = None
    customer_feedback: Optional[str] = None
    remarks: Optional[str] = None

    # Follow-ups History (multiple per enrollment)
    follow_ups: List[Dict[str, Any]] = Field(default_factory=list)

    # Assignment
    assigned_to: Optional[str] = None
    assigned_to_name: Optional[str] = None

    # System fields
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    last_modified_by: Optional[str] = None
    is_deleted: bool = False

    class Settings:
        name = "enrollments"
        use_state_management = True

    class Config:
        json_schema_extra = {
            "example": {
                "enrollment_id": "ENR_27122025_001",
                "linked_lead_id": "Tulip_25122025_001",
                "billed_date": "2025-12-27",
                "package_billed": "Maternity Premium",
                "hclhc_spoc": "Dr. Smith",
                "hcl_location": "Delhi",
                "uhid": "UH12345",
                "subscriber_name": "Jane Doe",
                "dob": "1990-05-15",
                "employee_code": "EMP001",
                "employee_name": "Jane Doe",
                "phone_number": "9876543210",
                "email": "jane@example.com",
                "address": "123 Street, Delhi 110001",
                "trimester": "Trimester 2",
                "doctor_name": "Dr. Sharma",
                "service_partner": "Motherhood",
                "partner_centre_selected": "Motherhood Noida",
                "partner_gynaecologist": "Dr. Kapoor",
                "connect_status": "Connected",
                "action_taken": "Appointment Booked",
                "follow_up_date": "2025-12-30T10:00:00",
                "customer_feedback": "Very satisfied with service",
                "remarks": "Regular follow-up scheduled",
                "follow_ups": [
                    {
                        "follow_up_number": 1,
                        "date": "2025-12-27T14:30:00",
                        "connect_status": "Connected",
                        "action_taken": "Feedback Taken",
                        "feedback": "Satisfied",
                        "remarks": "First follow-up completed"
                    }
                ]
            }
        }
