"""
Lead Model for CRM Lead Management
"""
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from beanie import Document, Indexed
from pydantic import Field, EmailStr, BaseModel
from enum import Enum


class LeadStatus(str, Enum):
    NOT_INTERESTED = "Not Interested"
    ENQUIRY_LEAD = "Enquiry Lead"
    LEAD_CLOSED_NO_RESPONSE = "Lead Closed-No Response"
    ENROLLED = "Enrolled"
    FOLLOWUP_IN_PROCESS = "Follow up-In Process"
    FOLLOWUP_NO_RESPONSE = "Follow up-No Response"
    DUPLICATE = "Duplicate"


class LeadSource(str, Enum):
    IN_CLINIC_WALK_IN = "In Clinic-Walk In"
    MAIL = "Mail"
    IN_CLINIC_GYNAE_CONSULT = "In Clinic-Gynae Consult"
    BUMP_DAY = "Bump Day"
    WEBSITE = "Website"
    CALL = "Call"
    AMA = "AMA"
    WHATSAPP = "WhatsApp"
    IN_CLINIC_OTHER_CONSULTS = "In Clinic-Other Consults"
    OTHERS = "Others"


class Trimester(str, Enum):
    TRIMESTER_1 = "Trimester 1"
    TRIMESTER_2 = "Trimester 2"
    TRIMESTER_3 = "Trimester 3"
    NOT_CONCEIVED = "Not Conceived"


class LookingFor(str, Enum):
    SELF = "Self"
    FAMILY_MEMBER = "Family Member"


class ServiceEnrolled(str, Enum):
    PRE_CONCEPTION = "PreConception"
    ANTENATAL = "Antenatal"
    MATERNITY_WELLNESS = "MaternityWellness"


class ServicePartner(str, Enum):
    MOTHERHOOD = "Motherhood"
    RAINBOW = "Rainbow"
    FORTIS = "Fortis"
    APOLLO_CRADLE = "Apollo Cradle"
    CLOUD_9 = "Cloud 9"
    HCL_HEALTHCARE = "HCL Healthcare"
    MAMILY = "Mamily"
    OTHERS = "Others"


class ReasonForNoSale(str, Enum):
    ALREADY_TAKING_SERVICE_OUTSIDE = "Already Taking Service outside"
    LOCATION_NOT_SUITABLE = "Location not suitable"
    DIFFERENT_SERVICE_PROVIDER_REQUIRED = "Different Service Provider Required-Brand"
    TRAVELLING_TO_NATIVE = "Travelling to Native Place for delivery"
    PACKAGE_COST = "Package Cost"
    ONLY_DELIVERY_PACKAGE = "Only Delivery Package required"
    PACKAGE_INADEQUATE = "Package inadequate"
    MISCARRIAGE = "Miscarriage"
    LOOKING_FOR_OTHER_HCLH = "Looking for other HCLH services"
    OTHERS = "Others"


class CallEntry(BaseModel):
    """Call entry for dynamic call tracking"""
    call_number: int
    date_time: Optional[datetime] = None
    summary: Optional[str] = None


class Comment(BaseModel):
    """Comment with timestamp"""
    text: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None


class Lead(Document):
    """Lead document model with updated fields per specification"""

    # Auto-generated LeadID: Tulip_DDMMYYYY_XXX
    lead_id: Indexed(str, unique=True)

    # System timestamps (auto-managed)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Lead Source and Status (mandatory, agent editable)
    lead_source: LeadSource
    lead_creation_date: Optional[date] = None  # Manual calendar select
    status: LeadStatus = LeadStatus.ENQUIRY_LEAD

    # User Details (mandatory: name, email, phone - agent cannot edit)
    name: str
    email: Optional[EmailStr] = None
    phone_number: str
    employee_id: Optional[str] = None
    uhid: Optional[str] = None

    # Location Details (agent cannot edit)
    user_facility: Optional[str] = None
    city: Optional[str] = None
    pin_code: Optional[str] = None
    address: Optional[str] = None

    # Lead Information
    trimester: Optional[Trimester] = None  # Renamed from stage
    looking_for: Optional[LookingFor] = None
    package_requested: Optional[str] = None

    # Service Details
    service_enrolled: Optional[ServiceEnrolled] = None
    package_name_enrolled: Optional[str] = None
    service_partner: Optional[ServicePartner] = None  # Renamed from provider_name
    provider_location: Optional[str] = None
    hclhc_spoc: Optional[str] = None

    # Reason for No Sale
    reason_for_no_sale: Optional[ReasonForNoSale] = None

    # Doctor/Consultation Details
    doctor_name: Optional[str] = None
    consult_date: Optional[date] = None

    # Call Tracking (agent editable)
    number_of_calls: int = 1
    calls: List[Dict[str, Any]] = Field(default_factory=list)
    follow_up_date: Optional[datetime] = None

    # Assignment (agent cannot edit)
    assigned_to: Optional[str] = None  # User ID
    assigned_to_name: Optional[str] = None

    # Reassignment (both admin and agent can edit)
    reassign_to: Optional[str] = None  # User ID - defaults to assigned_to
    reassign_to_name: Optional[str] = None

    # Comments (agent can add, sorted by latest)
    comments: List[Dict[str, Any]] = Field(default_factory=list)

    # System fields
    created_by: Optional[str] = None
    last_modified_by: Optional[str] = None
    is_deleted: bool = False

    class Settings:
        name = "leads"
        use_state_management = True

    class Config:
        json_schema_extra = {
            "example": {
                "lead_id": "Tulip_25122025_001",
                "lead_source": "Call",
                "lead_creation_date": "2025-12-25",
                "status": "New",
                "name": "John Doe",
                "email": "john@example.com",
                "phone_number": "9876543210",
                "employee_id": "EMP001",
                "uhid": "UH12345",
                "user_facility": "HCL Delhi",
                "city": "Delhi",
                "pin_code": "110001",
                "address": "123 Street, Area",
                "trimester": "Trimester 2",
                "looking_for": "Self",
                "package_requested": "Maternity Package",
                "service_enrolled": "Antenatal",
                "package_name_enrolled": "Premium Care",
                "service_partner": "Motherhood",
                "provider_location": "South Delhi",
                "hclhc_spoc": "Dr. Smith",
                "doctor_name": "Dr. Sharma",
                "consult_date": "2025-12-20",
                "number_of_calls": 2,
                "calls": [
                    {
                        "call_number": 1,
                        "date_time": "2025-12-25T14:30:00",
                        "summary": "Initial contact made"
                    }
                ],
                "follow_up_date": "2025-12-28T10:00:00",
                "assigned_to": "user_id_123",
                "assigned_to_name": "Agent Name",
                "comments": [
                    {
                        "text": "Customer interested in premium package",
                        "created_at": "2025-12-25T14:35:00",
                        "created_by": "user_id_123",
                        "created_by_name": "Agent Name"
                    }
                ]
            }
        }
