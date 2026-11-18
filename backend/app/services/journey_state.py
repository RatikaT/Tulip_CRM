"""
Journey Status: what is happening with the customer, chosen by the SPOC from a
list per service (shown in the enrollment header). Separate from the care
journey's own run state (`journey_status`: active | paused | stopped):

- A "Closed" Journey Status stops the care journey (pending steps dropped,
  history kept), the same as Stop journey.
- Moving from a Closed status back to an active one reopens the journey.
- "Pregnant – Interested in Antenatal program" is where the Antenatal lead is
  created from (on screen, or later from the Enrollments list for bulk uploads).

Every change is appended to `journey_state_history` on the record (for the
timeline) and written to the enrollment audit log (for reports).
"""
from datetime import datetime
from typing import Dict, List, Optional

from app.models.enrollment import Enrollment
from app.models.enrollment_audit_log import EnrollmentAuditAction, EnrollmentAuditLog
from app.services.journey_ops import stop_journey_steps

ACTIVE_OTHERS = "Active – Others"
CLOSED_OTHERS = "Closed – Others"
ANTENATAL_INTEREST = "Pregnant – Interested in Antenatal program"
FOLLOW_UP_ONGOING = "Follow-up ongoing"
STILL_PLANNING = "Active – Still planning"

# Grouped as shown in the dropdown. "Closed" group stops the care journey.
STATES: Dict[str, Dict[str, List[str]]] = {
    "PreConception": {
        "Active": [STILL_PLANNING, "Active – No response", ACTIVE_OTHERS],
        "Converts": [ANTENATAL_INTEREST],
        "Closed": [
            "Closed – Non responsive",
            "Closed – Not planning anymore",
            "Closed – Taking treatment outside",
            "Closed – Customer refused further follow-up",
            "Pregnant – Taking service outside",
            CLOSED_OTHERS,
        ],
    },
    "Antenatal": {
        "Active": [FOLLOW_UP_ONGOING, ACTIVE_OTHERS],
        "Closed": [
            "Closed – Delivered",
            "Closed – Miscarriage",
            "Closed – Customer moved to home town",
            "Closed – Taking service outside now",
            "Closed – Customer not satisfied",
            CLOSED_OTHERS,
        ],
    },
    "MaternityWellness": {
        "Active": [FOLLOW_UP_ONGOING, ACTIVE_OTHERS],
        "Closed": [CLOSED_OTHERS],
    },
}

NEEDS_NOTE = {ACTIVE_OTHERS, CLOSED_OTHERS}


def service_key(enrollment_or_service) -> Optional[str]:
    """The STATES key for an enrollment's service (legacy names like
    "Tulip Antenatal" match too)."""
    s = enrollment_or_service
    if not isinstance(s, (str, type(None))):
        s = getattr(s, "journey_classification", None) or getattr(s, "service_enrolled", None)
    low = (s or "").lower().replace(" ", "")
    for key in STATES:
        if key.lower() in low:
            return key
    return None


def allowed_states(service) -> List[str]:
    key = service_key(service)
    return [x for group in STATES[key].values() for x in group] if key else []


def is_closed(state: Optional[str]) -> bool:
    if not state:
        return False
    return any(state in STATES[k].get("Closed", []) for k in STATES)


def default_state(enrollment: Enrollment) -> Optional[str]:
    key = service_key(enrollment)
    if not key:
        return None
    return STILL_PLANNING if key == "PreConception" else FOLLOW_UP_ONGOING


def label(state: Optional[str], note: Optional[str]) -> str:
    """'Closed – Others: Relocated abroad' for display and exports."""
    if not state:
        return ""
    return f"{state}: {note}" if state in NEEDS_NOTE and note else state


def validate(enrollment: Enrollment, state: str, note: Optional[str]) -> Optional[str]:
    """Error text, or None if the status can be set on this enrollment."""
    allowed = allowed_states(enrollment)
    if not allowed:
        return f"No Journey Status list for service '{enrollment.service_enrolled or '-'}'"
    if state not in allowed:
        return f"'{state}' is not a Journey Status for {service_key(enrollment)}"
    if state in NEEDS_NOTE and not (note or "").strip():
        return "Describe the status for Others"
    if not is_closed(state) and enrollment.do_not_contact:
        return "This customer is marked Do Not Contact. Clear it before choosing an active status."
    return None


async def apply_state(enrollment: Enrollment, state: str, note: Optional[str],
                      user: dict, source: str = "screen") -> bool:
    """Set the Journey Status (caller has validated). Stops / reopens the care
    journey as needed, records history and audit. Saves the record.
    Returns False if nothing changed."""
    from app.services.enrollment_helpers import reinstantiate_care_journey

    note = (note or "").strip() or None if state in NEEDS_NOTE else None
    old_state, old_note = enrollment.journey_state, enrollment.journey_state_note
    if old_state == state and old_note == note:
        return False
    now = datetime.utcnow()
    by_name = user.get("full_name") or user.get("email") or "System"
    changes = [{"field": "journey_state", "old_value": label(old_state, old_note),
                "new_value": label(state, note)}]

    if is_closed(state) and enrollment.journey_status != "stopped":
        enrollment.journey = stop_journey_steps(enrollment.journey or [])
        enrollment.journey_status = "stopped"
        enrollment.journey_stopped_reason = label(state, note)
        enrollment.journey_stopped_by = user.get("user_id")
        enrollment.journey_stopped_by_name = by_name if source != "bulk" else f"{by_name} (Bulk upload)"
        enrollment.journey_stopped_at = now
        enrollment.paused_at = enrollment.paused_by = enrollment.paused_by_name = None
        enrollment.pause_reason = enrollment.resume_on = None
    elif is_closed(state):
        enrollment.journey_stopped_reason = label(state, note)
    elif is_closed(old_state) and enrollment.journey_status == "stopped" and not enrollment.do_not_contact:
        # Reopen: back to active, rebuild the remaining steps (done/skipped kept).
        enrollment.journey_status = "active"
        enrollment.journey_stopped_reason = enrollment.journey_stopped_by = None
        enrollment.journey_stopped_by_name = enrollment.journey_stopped_at = None
        enrollment.journey = await reinstantiate_care_journey(enrollment)
        changes.append({"field": "journey_status", "old_value": "stopped", "new_value": "active"})

    enrollment.journey_state = state
    enrollment.journey_state_note = note
    enrollment.journey_state_by_name = by_name
    enrollment.journey_state_at = now
    enrollment.journey_state_history = (enrollment.journey_state_history or []) + [{
        "at": now, "state": state, "note": note, "by": user.get("user_id"),
        "by_name": by_name, "source": source,
    }]
    enrollment.updated_at = now
    await enrollment.save()
    await EnrollmentAuditLog(
        enrollment_id=enrollment.enrollment_id,
        user_id=user.get("user_id"),
        user_email=user.get("email") or "system",
        user_name=by_name if source != "bulk" else f"{by_name} (Bulk upload)",
        action=EnrollmentAuditAction.UPDATED,
        changes=changes,
    ).insert()
    return True


async def preset_missing_states() -> int:
    """One-time preset for records without a Journey Status (idempotent):
    active -> the service's active default; stopped / DNC -> Closed – Others
    with the stop / DNC reason; already converted to an Antenatal lead ->
    Pregnant – Interested. Paused keep their pause and get the active default."""
    n = 0
    system = {"user_id": None, "email": "system", "full_name": "Set by system"}
    for e in await Enrollment.find({"is_deleted": False, "journey_state": None}).to_list():
        key = service_key(e)
        if not key:
            continue
        if e.converted_to_lead_id and key == "PreConception" and not e.do_not_contact:
            state, note = ANTENATAL_INTEREST, None
        elif e.do_not_contact or e.journey_status == "stopped":
            note = e.dnc_reason if e.do_not_contact else e.journey_stopped_reason
            note = note or ("Do Not Contact" if e.do_not_contact else "Journey stopped")
            state = CLOSED_OTHERS
        else:
            state, note = default_state(e), None
        # Record directly: the journey is already in the right run state.
        now = datetime.utcnow()
        e.journey_state, e.journey_state_note = state, (note if state in NEEDS_NOTE else None)
        e.journey_state_by_name, e.journey_state_at = system["full_name"], now
        e.journey_state_history = [{"at": now, "state": state, "note": e.journey_state_note,
                                    "by": None, "by_name": system["full_name"], "source": "preset"}]
        await e.save()
        n += 1
    return n


# ---------------- Log a call ----------------
CONNECTED = "Connected"
NOT_CONNECTED = "Not connected"
CALL_OUTCOMES = ["Feedback taken", "Asked for call back", "Appointment booked",
                 "Liaised with partner team", "No action required", "Others"]
NOT_CONNECTED_REASONS = ["No answer", "Switched off", "Wrong number", "Others"]
CALL_BACK = "Asked for call back"


def call_summary(fu: dict) -> str:
    """One line for a logged call: 'Connected · Feedback taken' or
    'Not connected · Switched off'. Older follow-ups: Connect Status · Action Taken."""
    if fu.get("call_status"):
        what = fu.get("outcome") if fu.get("call_status") == CONNECTED else fu.get("reason")
        if what == "Others" and fu.get("other_text"):
            what = fu["other_text"]
        return " · ".join(x for x in (fu["call_status"], what) if x)
    return " · ".join(x for x in (fu.get("connect_status"), fu.get("action_taken")) if x)
