"""
Audit Log Model for tracking all changes
"""
from datetime import datetime
from typing import Optional, List, Any
from beanie import Document
from pydantic import Field, BaseModel
from enum import Enum


class AuditAction(str, Enum):
    CREATED = "created"
    UPDATED = "updated"
    STATUS_CHANGED = "status_changed"
    CALL_ADDED = "call_added"
    ASSIGNED = "assigned"
    DELETED = "deleted"


class ChangeEntry(BaseModel):
    """Single field change entry"""
    field: str
    old_value: Optional[Any] = None
    new_value: Optional[Any] = None


class AuditLog(Document):
    """Audit log document for tracking all lead changes"""

    lead_id: str
    user_id: Optional[str] = None
    user_email: str
    user_name: str
    action: AuditAction
    changes: List[dict] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    ip_address: Optional[str] = None

    class Settings:
        name = "audit_logs"

    class Config:
        json_schema_extra = {
            "example": {
                "lead_id": "Tulip_24122025_001",
                "user_email": "agent@tulip.com",
                "user_name": "Agent One",
                "action": "status_changed",
                "changes": [
                    {
                        "field": "status",
                        "old_value": "New",
                        "new_value": "Called"
                    }
                ],
                "timestamp": "2025-12-24T14:30:00"
            }
        }
