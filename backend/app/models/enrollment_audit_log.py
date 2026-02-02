"""
Enrollment Audit Log Model for tracking all enrollment changes
"""
from datetime import datetime
from typing import Optional, List, Any
from beanie import Document, Indexed
from pydantic import Field, BaseModel
from enum import Enum


class EnrollmentAuditAction(str, Enum):
    CREATED = "created"
    UPDATED = "updated"
    STATUS_CHANGED = "status_changed"
    FOLLOW_UP_ADDED = "follow_up_added"
    ASSIGNED = "assigned"
    DELETED = "deleted"


class EnrollmentChangeEntry(BaseModel):
    """Single field change entry for enrollments"""
    field: str
    old_value: Optional[Any] = None
    new_value: Optional[Any] = None


class EnrollmentAuditLog(Document):
    """Audit log document for tracking all enrollment changes"""

    enrollment_id: Indexed(str)
    user_id: Optional[str] = None
    user_email: str
    user_name: str
    action: EnrollmentAuditAction
    changes: List[dict] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    ip_address: Optional[str] = None

    class Settings:
        name = "enrollment_audit_logs"

    class Config:
        json_schema_extra = {
            "example": {
                "enrollment_id": "ENR_24122025_001",
                "user_email": "agent@tulip.com",
                "user_name": "Agent One",
                "action": "follow_up_added",
                "changes": [
                    {
                        "field": "connect_status",
                        "old_value": "No Response",
                        "new_value": "Connected"
                    }
                ],
                "timestamp": "2025-12-24T14:30:00"
            }
        }
