"""
Journey Status list for one service, editable by the Super Admin
(Configurations -> Services & Journey Status). See services/journey_state.
"""
from datetime import datetime
from typing import List, Optional
from beanie import Document, Indexed
from pydantic import BaseModel, Field


class JourneyStatusItem(BaseModel):
    label: str
    group: str = "active"          # active | converts | closed (closed stops the care journey)
    needs_note: bool = False       # asks for a description (the "Others" statuses)


class JourneyStatusConfig(Document):
    service: Indexed(str, unique=True)
    items: List[JourneyStatusItem] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by_name: Optional[str] = None

    class Settings:
        name = "journey_status_configs"
