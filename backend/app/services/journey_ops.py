"""
Journey operations shared across Lead (outreach) and Enrollment (care):
building the outreach snapshot, stopping a journey, and mutating instance steps.

Pure list/dict helpers (no DB) so they're easy to test and reuse from routers.
"""
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple

from app.models.journey_template import JourneyContext, make_outreach_key
from app.services.journey_service import build_journey

# Lead statuses that trigger a central outreach journey.
OUTREACH_TRIGGER_STATUSES = [
    "Not Interested",
    "Lead Closed-No Response",
    "Follow up-No Response",
]


def _journey_dates(journey: List[Dict[str, Any]]) -> List[datetime]:
    out = []
    for s in journey or []:
        pd = s.get("planned_date")
        if isinstance(pd, datetime):
            out.append(pd)
    return out


async def build_outreach_for_lead(lead, anchor: datetime) -> List[Dict[str, Any]]:
    """
    Build the outreach journey for a (closed) lead. trigger_key is
    "<status>::<service>" or "<status>::GENERIC". Respects Do-Not-Contact and the
    15-day cap against the lead's existing journey dates.
    """
    trigger_key = make_outreach_key(lead.status, lead.service_requested)
    return await build_journey(
        JourneyContext.OUTREACH.value,
        trigger_key,
        anchor,
        existing_dates=_journey_dates(getattr(lead, "journey", []) or []),
        do_not_contact=bool(getattr(lead, "do_not_contact", False)),
    )


def stop_journey_steps(journey: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Cancel remaining PENDING steps but retain history: keep done/skipped steps,
    drop pending ones. Returns the trimmed journey list.
    """
    return [s for s in (journey or []) if s.get("status") in ("done", "skipped")]


def apply_step_update(
    journey: List[Dict[str, Any]],
    step_id: str,
    *,
    status: Optional[str],
    planned_date: Optional[datetime],
    notes: Optional[str],
    user_id: str,
    user_name: str,
) -> Tuple[List[Dict[str, Any]], bool, Optional[str]]:
    """Mark a step done/skipped/pending, reschedule, or add notes. Returns (journey, ok, error)."""
    step = next((s for s in (journey or []) if s.get("step_id") == step_id), None)
    if not step:
        return journey, False, "Journey step not found"
    if status is not None:
        if status not in ("pending", "done", "skipped"):
            return journey, False, "status must be pending, done or skipped"
        step["status"] = status
        if status == "done":
            step["completed_date"] = datetime.utcnow()
            step["completed_by"] = user_id
            step["completed_by_name"] = user_name
        else:
            step["completed_date"] = None
            step["completed_by"] = None
            step["completed_by_name"] = None
    if planned_date is not None:
        step["planned_date"] = planned_date
    if notes is not None:
        step["notes"] = notes
    return journey, True, None


def add_adhoc_step(
    journey: List[Dict[str, Any]],
    *,
    name: str,
    description: Optional[str],
    step_type: str,
    planned_date: Optional[datetime],
) -> List[Dict[str, Any]]:
    journey = journey or []
    max_order = max((s.get("order", 0) for s in journey), default=-1)
    journey.append({
        "step_id": uuid.uuid4().hex[:12],
        "name": name.strip(),
        "description": (description.strip() if description else None),
        "step_type": step_type or "Other",
        "planned_date": planned_date,
        "status": "pending",
        "completed_date": None,
        "completed_by": None,
        "completed_by_name": None,
        "notes": None,
        "order": max_order + 1,
        "occurrence_index": 0,
        "is_optional": False,
        "is_adhoc": True,
    })
    return journey


def remove_step(journey: List[Dict[str, Any]], step_id: str) -> Tuple[List[Dict[str, Any]], bool]:
    journey = journey or []
    new_journey = [s for s in journey if s.get("step_id") != step_id]
    return new_journey, (len(new_journey) != len(journey))


def compute_care_triggers(service, trimester) -> Dict[str, Any]:
    """
    Agent-facing trigger hints for a care enrollment (see spec 4e):
      - needs_trimester:          Antenatal with a blank trimester -> prompt to add it.
      - trimester_contradiction:  Antenatal with "Not Conceived" -> correct or flag admin.
      - is_preconception:         PreConception -> offers "Mark conceived" conversion.
    """
    svc = (service.value if hasattr(service, "value") else (service or "")).strip().lower()
    tri = (trimester.value if hasattr(trimester, "value") else (trimester or "")).strip()
    is_antenatal = svc == "antenatal"
    return {
        "needs_trimester": is_antenatal and not tri,
        "trimester_contradiction": is_antenatal and tri == "Not Conceived",
        "is_preconception": svc == "preconception",
    }


def overdue_pending_steps(journey: List[Dict[str, Any]], now: Optional[datetime] = None) -> List[Dict[str, Any]]:
    """Pending steps whose planned_date is in the past."""
    now = now or datetime.utcnow()
    out = []
    for s in journey or []:
        if s.get("status") == "pending":
            pd = s.get("planned_date")
            if isinstance(pd, datetime) and pd < now:
                out.append(s)
    return out
