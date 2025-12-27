"""
Summary Model for storing AI-generated summaries
"""
from datetime import datetime
from typing import Optional
from beanie import Document
from pydantic import Field
from enum import Enum


class SummaryType(str, Enum):
    OVERALL = "overall"
    AGENT = "agent"
    DAILY = "daily"


class Summary(Document):
    """Summary document model"""

    summary_type: SummaryType
    content: str

    # For agent-wise summaries
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None

    # For daily summaries
    summary_date: Optional[str] = None  # YYYY-MM-DD format

    # For daily agent activity summaries
    activity_metrics: Optional[dict] = None  # Aggregate metrics (calls_made, followups_due, etc.)
    lead_details: Optional[dict] = None  # Lead-level breakdown

    # Metadata
    total_leads: int = 0
    status_distribution: dict = Field(default_factory=dict)
    source_distribution: dict = Field(default_factory=dict)
    service_distribution: dict = Field(default_factory=dict)

    # System fields
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None

    class Settings:
        name = "summaries"

    class Config:
        json_schema_extra = {
            "example": {
                "summary_type": "overall",
                "content": "Summary of all leads...",
                "total_leads": 100,
                "status_distribution": {"New": 50, "Interested": 30},
                "source_distribution": {"Call": 40, "Website": 30},
                "service_distribution": {"Antenatal": 25}
            }
        }
