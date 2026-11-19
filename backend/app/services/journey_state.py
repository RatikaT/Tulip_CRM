"""
Journey Status: what is happening with the customer, chosen by the SPOC from a
list per service (shown in the enrollment header). Separate from the care
journey's own run state (`journey_status`: active | paused | stopped):

- A "Closed" Journey Status stops the care journey (pending steps dropped,
  history kept), the same as Stop journey.
- Moving from a Closed status back to an active one reopens the journey.
- A "Converts" status ("Pregnant – Interested in Antenatal program") is where
  the Antenatal lead is created from (on screen, or from the Enrollments list).
- The lists are edited by the Super Admin (Configurations -> Services &
  Journey Status) and cached here; see load_config.

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

GROUPS = ("active", "converts", "closed")
GROUP_TITLES = {"active": "Active", "converts": "Converts", "closed": "Closed"}

# Starting lists (seeded once into journey_status_configs; the Super Admin
# edits them from Configurations). Grouped as shown in the dropdown.
DEFAULT_STATES: Dict[str, Dict[str, List[str]]] = {
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
# A service added later starts with this list.
NEW_SERVICE_STATES = {"Active": [FOLLOW_UP_ONGOING, ACTIVE_OTHERS], "Closed": [CLOSED_OTHERS]}
DEFAULT_SERVICES = list(DEFAULT_STATES)

# In-memory copies of the configured lists (refreshed by load_config after
# every edit and every few minutes). Mutated in place so imports stay valid.
STATES: Dict[str, Dict[str, List[str]]] = {k: {g: list(v) for g, v in d.items()} for k, d in DEFAULT_STATES.items()}
NEEDS_NOTE = {ACTIVE_OTHERS, CLOSED_OTHERS}
CONVERTS = {ANTENATAL_INTEREST}
SERVICES: List[str] = list(DEFAULT_SERVICES)


def _norm(x: Optional[str]) -> str:
    return (x or "").lower().replace(" ", "").replace("-", "")


async def load_config() -> None:
    """Load Services (the shared Service dropdown) and each service's Journey
    Status list; seed any missing list. Safe to call any time."""
    from app.models.dropdown_config import DropdownConfig
    from app.models.journey_status_config import JourneyStatusConfig, JourneyStatusItem

    cfg = await DropdownConfig.find_one({"field_name": "service_enrolled"})
    services = [s for s in (cfg.options if cfg else []) if s and s.strip()] or list(DEFAULT_SERVICES)
    rows = {r.service: r for r in await JourneyStatusConfig.find_all().to_list()}
    for svc in services:
        if svc in rows:
            continue
        groups = DEFAULT_STATES.get(svc) or NEW_SERVICE_STATES
        items = [JourneyStatusItem(label=x, group=g.lower(), needs_note=x in (ACTIVE_OTHERS, CLOSED_OTHERS))
                 for g, xs in groups.items() for x in xs]
        rows[svc] = JourneyStatusConfig(service=svc, items=items)
        await rows[svc].insert()

    states, notes, converts = {}, set(), set()
    for svc in services:
        grouped: Dict[str, List[str]] = {}
        for it in rows[svc].items:
            grouped.setdefault(GROUP_TITLES.get(it.group, "Active"), []).append(it.label)
            if it.needs_note:
                notes.add(it.label)
            if it.group == "converts":
                converts.add(it.label)
        states[svc] = {t: grouped[t] for t in GROUP_TITLES.values() if t in grouped}
    STATES.clear(); STATES.update(states)
    NEEDS_NOTE.clear(); NEEDS_NOTE.update(notes)
    CONVERTS.clear(); CONVERTS.update(converts)
    SERVICES[:] = services


def services() -> List[str]:
    return list(SERVICES)


def service_key(enrollment_or_service) -> Optional[str]:
    """The configured service for an enrollment's service value. Exact match
    first; older names like "Tulip Antenatal" map to the standard three."""
    s = enrollment_or_service
    if not isinstance(s, (str, type(None))):
        s = getattr(s, "journey_classification", None) or getattr(s, "service_enrolled", None)
    if not s:
        return None
    exact = next((k for k in STATES if _norm(k) == _norm(s)), None)
    if exact:
        return exact
    from app.models.journey_template import normalize_service
    std = normalize_service(s)
    return next((k for k in STATES if _norm(k) == _norm(std)), None)


def allowed_states(service) -> List[str]:
    key = service_key(service)
    return [x for group in STATES[key].values() for x in group] if key else []


def is_closed(state: Optional[str]) -> bool:
    if not state:
        return False
    return any(state in STATES[k].get("Closed", []) for k in STATES)


def is_converts(state: Optional[str]) -> bool:
    return bool(state) and state in CONVERTS


def default_state(enrollment: Enrollment) -> Optional[str]:
    """The first Active status of the enrollment's service."""
    key = service_key(enrollment)
    if not key:
        return None
    active = STATES[key].get("Active") or allowed_states(key)
    return active[0] if active else None


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
    elif enrollment.journey_status == "stopped" and not enrollment.converted_to_lead_id:
        # Reopen: back to active (clearing an old Do Not Contact), rebuild the
        # remaining steps (done/skipped kept).
        if enrollment.do_not_contact:
            enrollment.do_not_contact = False
            enrollment.dnc_reason = None
            changes.append({"field": "do_not_contact", "old_value": True, "new_value": False})
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


async def sync_stopped_states() -> int:
    """Journeys stopped (Stop journey / Do Not Contact) while the Journey Status
    stayed active get Closed – Others with the stop reason, so the record shows
    as closed everywhere (idempotent). Converted-to-Antenatal records are left as they are."""
    n = 0
    q = {"is_deleted": False, "converted_to_lead_id": None,
         "$or": [{"journey_status": "stopped"}, {"do_not_contact": True}]}
    for e in await Enrollment.find(q).to_list():
        if not e.journey_state or is_closed(e.journey_state) or not service_key(e):
            continue
        note = (e.dnc_reason if e.do_not_contact else e.journey_stopped_reason) or \
            ("Do Not Contact" if e.do_not_contact else "Journey stopped")
        now = datetime.utcnow()
        e.journey_state, e.journey_state_note = CLOSED_OTHERS, note
        e.journey_state_by_name, e.journey_state_at = "Set by system", now
        e.journey_state_history = (e.journey_state_history or []) + [{
            "at": now, "state": CLOSED_OTHERS, "note": note, "by": None,
            "by_name": "Set by system", "source": "preset"}]
        await e.save()
        n += 1
    return n


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
        conv = STATES[key].get("Converts") or []
        if e.converted_to_lead_id and conv and not e.do_not_contact:
            state, note = conv[0], None
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
