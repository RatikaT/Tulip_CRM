"""
Care Journey helpers.

Snapshots a service's journey template onto an enrollment when it is created.
Planned dates are computed as enrollment_date + step.offset_days (Phase 1 model:
fixed offsets from enrollment, snapshotted so later template edits don't change
existing customers).
"""
import logging
import re
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from app.models.journey_template import JourneyTemplate

logger = logging.getLogger(__name__)


async def get_template_for_service(service: Optional[str]) -> Optional[JourneyTemplate]:
    """Find the journey template for a service (case-insensitive exact match)."""
    if not service or not service.strip():
        return None
    return await JourneyTemplate.find_one(
        {"service": {"$regex": f"^{re.escape(service.strip())}$", "$options": "i"}}
    )


async def build_journey_for_service(
    service: Optional[str],
    anchor_date: datetime,
) -> List[Dict[str, Any]]:
    """
    Build a journey-instance list (snapshot) from the service's template.
    Returns [] when there is no template for the service.
    """
    template = await get_template_for_service(service)
    if not template or not template.steps:
        return []

    journey: List[Dict[str, Any]] = []
    for step in sorted(template.steps, key=lambda s: s.order):
        planned = anchor_date + timedelta(days=step.offset_days or 0)
        journey.append({
            "step_id": step.step_id,
            "name": step.name,
            "description": step.description,
            "step_type": step.step_type,
            "planned_date": planned,
            "status": "pending",
            "completed_date": None,
            "completed_by": None,
            "completed_by_name": None,
            "notes": None,
            "order": step.order,
            "is_adhoc": False,
        })
    logger.info(f"Built journey of {len(journey)} step(s) for service '{service}'")
    return journey
