"""
Enrollment Model for CRM Enrollment Management
"""
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from beanie import Document, Indexed
from pydantic import Field, EmailStr, BaseModel
from enum import Enum

# Import shared enums from lead model
from app.models.lead import Trimester, ServicePartner, ServiceEnrolled


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
    hcl_facility: Optional[str] = None

    # Doctor Name
    doctor_name: Optional[str] = None

    # User Details (at least one of: email, uhid, phone_number required)
    uhid: Optional[str] = None
    subscriber_name: Optional[str] = None
    dob: Optional[date] = None
    employee_id: Optional[str] = None  # Primary identifier (can have multiple enrollments)
    name: Optional[str] = None  # Employee/User Name
    phone_number: Optional[str] = None  # At least one of: email, uhid, phone_number required
    email: Optional[EmailStr] = None
    address: Optional[str] = None

    # Service Details
    trimester: Optional[Trimester] = None
    service_enrolled: Optional[str] = None
    package_name_enrolled: Optional[str] = None
    service_partner: Optional[str] = None
    partner_centre_selected: Optional[str] = None
    partner_gynaecologist: Optional[str] = None

    # Status (Dropdowns)
    connect_status: Optional[ConnectStatus] = None
    action_taken: Optional[ActionTaken] = None

    # Current Follow-up Tracking
    follow_up_date: Optional[datetime] = None
    next_follow_up_date: Optional[datetime] = None  # Next scheduled follow-up date
    customer_feedback: Optional[str] = None
    remarks: Optional[str] = None

    # Follow-ups History (multiple per enrollment)
    follow_ups: List[Dict[str, Any]] = Field(default_factory=list)

    # Care Journey — snapshot of the service's journey template at enrollment time.
    # Each item: {step_id, name, description, step_type, planned_date, status
    # (pending|done|skipped), completed_date, completed_by, completed_by_name,
    # notes, order, is_adhoc, is_optional, occurrence_index}. Worked by the SPOC.
    journey: List[Dict[str, Any]] = Field(default_factory=list)

    # Journey-level controls. "stopped" cancels remaining pending steps (reason
    # kept) but retains done/skipped history for attribution/reporting.
    journey_status: str = "active"            # active | stopped
    journey_stopped_reason: Optional[str] = None
    journey_stopped_by: Optional[str] = None
    journey_stopped_by_name: Optional[str] = None
    journey_stopped_at: Optional[datetime] = None

    # Do-Not-Contact — hard-stops all journeys; no new touchpoints generate.
    do_not_contact: bool = False
    dnc_reason: Optional[str] = None
    dnc_set_by: Optional[str] = None
    dnc_at: Optional[datetime] = None

    # Agent->Admin flag (e.g. Antenatal with "Not Conceived" trimester). Cleared
    # on reclassify. journey_classification overrides the snapshot source service.
    journey_flag: Optional[str] = None            # e.g. "trimester_contradiction"
    journey_flag_note: Optional[str] = None
    journey_flagged_at: Optional[datetime] = None
    journey_classification: Optional[str] = None  # admin reclassification target

    # PreConception -> Antenatal conversion link.
    converted_to_lead_id: Optional[str] = None

    # Assignment
    assigned_to: Optional[str] = None
    assigned_to_name: Optional[str] = None
    assigned_date: Optional[datetime] = None  # Date when first assigned
    reassigned_to: Optional[str] = None  # User ID if reassigned
    reassigned_to_name: Optional[str] = None  # User name if reassigned
    reassigned_date: Optional[datetime] = None  # Date when reassigned

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
                "hcl_facility": "Delhi",
                "uhid": "UH12345",
                "subscriber_name": "Jane Doe",
                "dob": "1990-05-15",
                "employee_id": "EMP001",
                "name": "Jane Doe",
                "phone_number": "9876543210",
                "email": "jane@example.com",
                "address": "123 Street, Delhi 110001",
                "trimester": "Trimester 2",
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
