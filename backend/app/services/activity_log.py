"""
Activity Log: one chronological list of "who did what, to which customer,
when" across Leads and Enrollments. Feeds the Activity Log MIS export and the
per-SPOC activity summary on the dashboard.

Sources (all read-only):
- Lead AuditLog          -> status / follow-up date / calls / comments / assignment / field edits
- Enrollment AuditLog    -> field edits, created, service added, deleted
- Enrollment follow_ups  -> follow-ups logged (richer than their audit entry, incl. remarks)
- Journey steps          -> care / outreach steps marked done (these write no audit entry)
- Stop journey / DNC     -> read from the record's own stamps (these write no audit entry)
"""
import re
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from app.models.audit_log import AuditLog
from app.models.enrollment import Enrollment
from app.models.enrollment_audit_log import EnrollmentAuditLog
from app.models.lead import Lead
from app.models.user import User
from app.utils.ist import to_ist
from app.utils.mis_helpers import parse_dt

# Action categories (also the columns of the dashboard summary)
STATUS = "Status changed"
FOLLOWUP_DATE = "Follow-up date changed"
CALL_ADDED = "Call added"
CALL_EDITED = "Call edited"
REMARK = "Remark added"
ASSIGNED = "Assigned"
REASSIGNED = "Reassigned"
CREATED = "Created"
ENR_FOLLOWUP = "Follow-up logged"
CARE_STEP = "Care step done"
OUTREACH_STEP = "Outreach step done"
JOURNEY_STOPPED = "Journey stopped"
JOURNEY_PAUSED = "Journey paused"
JOURNEY_RESUMED = "Journey resumed"
DNC = "Do Not Contact set"
SERVICE_ADDED = "Service added"
DELETED = "Deleted"
FIELD_UPDATED = "Field updated"

# Internal bookkeeping fields: never shown (ids, stamps, counters)
_SKIP_FIELDS = {
    "assigned_to", "reassign_to", "assigned_date", "reassigned_date",
    "updated_at", "last_modified_by", "number_of_calls", "reassigned_to",
}

_CALL_RE = re.compile(r"^Call (\d+)( Summary| Date)?$")


_LABELS = {
    "hclhc_spoc": "HCLH SPOC (Nurture Buddy)",
    "assigned_to_name": "Assigned To",
    "reassign_to_name": "Reassigned To",
    "reassigned_to_name": "Reassigned To",
    "hcl_facility": "HCL Facility",
    "uhid": "UHID",
    "next_follow_up_date": "Next Follow-up Due",
    "follow_up_date": "Follow-up Date",
    "comments": "Remarks",
}

# "Added - Date: 2026-09-25 12:24, ..." in call audit entries: that time is UTC
_CALL_DATE_RE = re.compile(r"Date: (\d{4}-\d{2}-\d{2} \d{2}:\d{2})")
_ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}")


# Enrollment-only overrides: on enrollments `name` is the employee's name
# (distinct from subscriber_name); leads keep the plain "Name" label.
_ENR_LABELS = {
    "name": "Employee Name",
}


def _label(field: str, enrollment: bool = False) -> str:
    if enrollment and field in _ENR_LABELS:
        return _ENR_LABELS[field]
    return _LABELS.get(field) or field.replace("_", " ").strip().title()


def _display(v):
    """Audit values -> what a reader expects: UTC datetimes as IST text,
    midnight-UTC datetimes (date-only fields) as a plain date, call times in IST."""
    if isinstance(v, str) and _ISO_RE.match(v):
        v = parse_dt(v) or v
    if isinstance(v, datetime):
        if v.tzinfo is None and (v.hour, v.minute, v.second) == (0, 0, 0):
            return v.strftime("%d %b %Y")
        return to_ist(v).strftime("%d %b %Y, %I:%M %p")
    if isinstance(v, str) and "Date: " in v:
        def _fix(m):
            try:
                return "Date: " + to_ist(datetime.strptime(m.group(1), "%Y-%m-%d %H:%M")).strftime("%d %b %Y, %I:%M %p")
            except ValueError:
                return m.group(0)
        return _CALL_DATE_RE.sub(_fix, v)
    if isinstance(v, bool):
        return None
    return v


def _v(x):
    return x.value if hasattr(x, "value") else x


def classify_lead_change(field: str, new_value) -> Optional[str]:
    if field in _SKIP_FIELDS:
        return None
    if field == "status":
        return STATUS
    if field == "follow_up_date":
        return FOLLOWUP_DATE
    if field == "comments":
        return REMARK
    if field == "assigned_to_name":
        return ASSIGNED
    if field in ("reassign_to_name", "reassigned_to_name"):
        return REASSIGNED
    if field == "lead":
        return CREATED
    if field == "is_deleted":
        return DELETED
    m = _CALL_RE.match(field or "")
    if m:
        if m.group(2):
            return CALL_EDITED
        return CALL_EDITED if new_value == "Deleted" else CALL_ADDED
    return FIELD_UPDATED


def classify_enrollment_change(field: str, new_value=None) -> Optional[str]:
    if field in _SKIP_FIELDS or field in ("journey_shift_days", "resume_on", "pause_reason"):
        return None
    if field == "journey_status":
        return JOURNEY_PAUSED if new_value == "paused" else JOURNEY_RESUMED if new_value == "active" else FIELD_UPDATED
    if field == "enrollment":
        return CREATED
    if field == "service_added":
        return SERVICE_ADDED
    if field == "is_deleted":
        return DELETED
    if field in ("next_follow_up_date", "follow_up_date"):
        return FOLLOWUP_DATE
    if field in ("remarks", "customer_feedback"):
        return REMARK
    if field in ("hclhc_spoc", "assigned_to_name"):
        return REASSIGNED
    return FIELD_UPDATED


def _phantom_reassign_filter(logs: List[AuditLog], leads: Optional[Dict] = None) -> set:
    """(log id, change index) pairs for reassignment rows that were never real:
    the old edit form re-sent 'reassign to = current owner' on every save."""
    phantom = set()
    by_lead = defaultdict(list)
    for lg in logs:
        by_lead[lg.lead_id].append(lg)
    for lead_id, lead_logs in by_lead.items():
        lead_logs.sort(key=lambda x: x.timestamp or datetime.min)
        # Owner at creation: the "from" of the first assignment change, else the
        # lead's current assignee (it was never changed).
        first = next((ch for lg in lead_logs for ch in (lg.changes or [])
                      if ch.get("field") == "assigned_to_name"), None)
        lead = (leads or {}).get(lead_id)
        owner = first.get("old_value") if first else (lead.assigned_to_name if lead else None)
        for lg in lead_logs:
            for i, ch in enumerate(lg.changes or []):
                f = ch.get("field")
                if f == "assigned_to_name":
                    owner = ch.get("new_value")
                elif f in ("reassign_to_name", "reassigned_to_name"):
                    new = ch.get("new_value")
                    if not new or new == owner or new == ch.get("old_value"):
                        phantom.add((str(lg.id), i))
                    else:
                        owner = new
    return phantom


async def collect_activity(start_utc: datetime, end_utc: datetime) -> List[Dict]:
    """All activity rows in [start_utc, end_utc), oldest first."""
    rows: List[Dict] = []
    users = {str(u.id): u.full_name for u in await User.find_all().to_list()}

    # ---------------- Leads: audit log ----------------
    # Need each lead's full history (not just the window) to spot phantom
    # reassignments, so load all logs for the leads touched in the window.
    win_logs = await AuditLog.find({"timestamp": {"$gte": start_utc, "$lt": end_utc}}).to_list()
    lead_ids = list({lg.lead_id for lg in win_logs})
    all_logs = await AuditLog.find({"lead_id": {"$in": lead_ids}}).to_list() if lead_ids else []
    leads = {l.lead_id: l for l in await Lead.find({"lead_id": {"$in": lead_ids}}).to_list()} if lead_ids else {}
    phantom = _phantom_reassign_filter(all_logs, leads)

    for lg in win_logs:
        lead = leads.get(lg.lead_id)
        entry = []
        for i, ch in enumerate(lg.changes or []):
            field = ch.get("field") or ""
            action = classify_lead_change(field, ch.get("new_value"))
            if not action or (str(lg.id), i) in phantom:
                continue
            entry.append({
                "at": lg.timestamp, "type": "Lead", "record_id": lg.lead_id,
                "customer": (lead.name if lead else DELETED_RECORD),
                "service": _v(lead.service_requested) if lead else None,
                "owner": (lead.reassign_to_name or lead.assigned_to_name) if lead else None,
                "action": action,
                "field": "" if action in (CREATED, DELETED, REMARK) else _label(field),
                "from": ch.get("old_value"), "to": ch.get("new_value"),
                "details": "",
                "by": lg.user_name,
            })
        rows.extend(_fold_into_status(entry))

    # ---------------- Enrollments: audit log (follow-ups come from the record) ----------------
    enr_logs = await EnrollmentAuditLog.find({
        "timestamp": {"$gte": start_utc, "$lt": end_utc},
        "action": {"$ne": "follow_up_added"},
    }).to_list()
    start_iso, end_iso = start_utc.isoformat(), end_utc.isoformat()
    enr_q = {"$or": [
        {"enrollment_id": {"$in": list({lg.enrollment_id for lg in enr_logs})}},
        {"follow_ups.created_at": {"$gte": start_iso, "$lt": end_iso}},
        {"journey.completed_date": {"$gte": start_utc, "$lt": end_utc}},
        {"journey_stopped_at": {"$gte": start_utc, "$lt": end_utc}},
        {"dnc_at": {"$gte": start_utc, "$lt": end_utc}},
    ]}
    enrollments = {e.enrollment_id: e for e in await Enrollment.find(enr_q).to_list()}

    def enr_row(e, at, action, field, frm, to, by, record_id=None, details=""):
        return {
            "at": at, "type": "Enrollment", "record_id": e.enrollment_id if e else record_id,
            "customer": (e.subscriber_name or e.name) if e else DELETED_RECORD,
            "service": e.service_enrolled if e else None,
            "owner": e.hclhc_spoc if e else None,
            "action": action, "field": field, "from": frm, "to": to, "by": by,
            "details": details,
        }

    for lg in enr_logs:
        e = enrollments.get(lg.enrollment_id)
        # Converting a lead creates the enrollment (no audit entry), then the
        # billing form fills it a second later. Show that as one "Created" row.
        if (e and e.linked_lead_id and e.created_at and lg.timestamp
                and _v(lg.action) == "updated"
                and abs((lg.timestamp - e.created_at).total_seconds()) < 120
                and all(ch.get("old_value") in (None, "") for ch in (lg.changes or []))):
            rows.append(enr_row(e, lg.timestamp, CREATED, f"From lead {e.linked_lead_id}", None, "created",
                                lg.user_name, details=_details(lg.changes, enrollment=True)))
            continue
        for ch in (lg.changes or []):
            field = ch.get("field") or ""
            action = classify_enrollment_change(field, ch.get("new_value"))
            if not action:
                continue
            rows.append(enr_row(e, lg.timestamp, action,
                                "" if action in (CREATED, DELETED) else _label(field, enrollment=True),
                                ch.get("old_value"), ch.get("new_value"), lg.user_name,
                                record_id=lg.enrollment_id))

    def in_win(dt):
        d = parse_dt(dt)
        return d is not None and start_utc <= d < end_utc

    for e in enrollments.values():
        for fu in (e.follow_ups or []):
            at = parse_dt(fu.get("created_at") or fu.get("date"))
            if at and start_utc <= at < end_utc:
                detail = " | ".join(x for x in (
                    fu.get("connect_status"), fu.get("action_taken"),
                    f"Feedback: {fu['feedback']}" if fu.get("feedback") else None,
                    f"Remarks: {fu['remarks']}" if fu.get("remarks") else None,
                ) if x)
                rows.append(enr_row(e, at, ENR_FOLLOWUP, f"Follow-up #{fu.get('follow_up_number')}",
                                    None, detail, fu.get("created_by_name")))
                if fu.get("next_follow_up_date"):
                    rows.append(enr_row(e, at, FOLLOWUP_DATE, "Next Follow-up Due", None,
                                        parse_dt(fu.get("next_follow_up_date")), fu.get("created_by_name")))
        for s in (e.journey or []):
            if s.get("status") == "done" and in_win(s.get("completed_date")):
                rows.append(enr_row(e, parse_dt(s.get("completed_date")), CARE_STEP, s.get("name"),
                                    None, s.get("notes"), s.get("completed_by_name")))
        if in_win(e.journey_stopped_at) and not _stopped_by_dnc(e):
            rows.append(enr_row(e, e.journey_stopped_at, JOURNEY_STOPPED, "Care journey", None,
                                e.journey_stopped_reason, e.journey_stopped_by_name))
        if e.do_not_contact and in_win(e.dnc_at):
            rows.append(enr_row(e, e.dnc_at, DNC, "", None, e.dnc_reason,
                                users.get(e.dnc_set_by or "", e.dnc_set_by)))

    # ---------------- Lead outreach journeys (no audit entries) ----------------
    o_leads = await Lead.find({"$or": [
        {"journey.completed_date": {"$gte": start_utc, "$lt": end_utc}},
        {"journey_stopped_at": {"$gte": start_utc, "$lt": end_utc}},
        {"dnc_at": {"$gte": start_utc, "$lt": end_utc}},
    ]}).to_list()
    for l in o_leads:
        base = {"type": "Lead", "record_id": l.lead_id, "customer": l.name,
                "service": _v(l.service_requested), "owner": l.reassign_to_name or l.assigned_to_name}
        for s in (l.journey or []):
            if s.get("status") == "done" and in_win(s.get("completed_date")):
                rows.append({**base, "at": parse_dt(s.get("completed_date")), "action": OUTREACH_STEP,
                             "field": s.get("name"), "from": None, "to": s.get("notes"),
                             "by": s.get("completed_by_name")})
        if in_win(l.journey_stopped_at) and not _stopped_by_dnc(l):
            rows.append({**base, "at": l.journey_stopped_at, "action": JOURNEY_STOPPED,
                         "field": "Outreach journey", "from": None, "to": l.journey_stopped_reason,
                         "by": l.journey_stopped_by_name})
        if getattr(l, "do_not_contact", False) and in_win(l.dnc_at):
            rows.append({**base, "at": l.dnc_at, "action": DNC, "field": "", "from": None,
                         "to": getattr(l, "dnc_reason", None), "by": users.get(l.dnc_set_by or "", l.dnc_set_by)})

    for r in rows:
        r["from"], r["to"] = _display(r["from"]), _display(r["to"])
    rows.sort(key=lambda r: r["at"] or datetime.min)
    return rows


DELETED_RECORD = "(record deleted)"
# Edits saved together with a status change are part of that action
# (e.g. "Not Interested" + reason, or "Enrolled" + the conversion form).
_FOLDABLE = {FIELD_UPDATED}


def _details(changes, enrollment: bool = False) -> str:
    parts = []
    for ch in changes or []:
        f = ch.get("field") or ""
        if f in _SKIP_FIELDS or ch.get("new_value") in (None, ""):
            continue
        parts.append(f"{_label(f, enrollment)}: {_display(ch.get('new_value'))}")
    return "; ".join(parts)


def _fold_into_status(entry: List[Dict]) -> List[Dict]:
    status = next((r for r in entry if r["action"] == STATUS), None)
    if not status:
        return entry
    folded = [r for r in entry if r["action"] in _FOLDABLE]
    status["details"] = "; ".join(f"{r['field']}: {_display(r['to'])}" for r in folded)
    return [r for r in entry if r["action"] not in _FOLDABLE]


def _stopped_by_dnc(rec) -> bool:
    """Setting DNC also stops the journey; that's one action, listed as DNC."""
    if not getattr(rec, "do_not_contact", False) or not rec.dnc_at or not rec.journey_stopped_at:
        return False
    return abs((rec.journey_stopped_at - rec.dnc_at).total_seconds()) < 120


# Columns of the per-person summary, in display order
SUMMARY_COLUMNS = [
    STATUS, FOLLOWUP_DATE, CALL_ADDED, CALL_EDITED, REMARK, ENR_FOLLOWUP, CARE_STEP,
    OUTREACH_STEP, JOURNEY_PAUSED, JOURNEY_RESUMED, JOURNEY_STOPPED, DNC, SERVICE_ADDED, ASSIGNED, REASSIGNED,
    CREATED, DELETED, FIELD_UPDATED,
]
# Creating or deleting a record isn't "working" it
_NOT_WORK = {CREATED, DELETED}


def summary_columns(people: List[Dict]) -> List[str]:
    """Only the action types that actually occur, so every row adds up to its total."""
    return [c for c in SUMMARY_COLUMNS if any(p["counts"].get(c) for p in people)]


def summarize_by_person(rows: List[Dict]) -> List[Dict]:
    """One row per person who did something: counts per action type, distinct
    leads / enrollments touched, and total actions."""
    people: Dict[str, Dict] = {}
    for r in rows:
        name = r.get("by") or "Unknown"
        p = people.setdefault(name, {
            "name": name, "counts": defaultdict(int), "leads": set(), "enrollments": set(),
            "total": 0, "last_at": None,
        })
        p["counts"][r["action"]] += 1
        p["total"] += 1
        if r["action"] not in _NOT_WORK:
            (p["leads"] if r["type"] == "Lead" else p["enrollments"]).add(r["record_id"])
        if r["at"] and (p["last_at"] is None or r["at"] > p["last_at"]):
            p["last_at"] = r["at"]
    out = []
    for p in people.values():
        out.append({
            "name": p["name"],
            "leads_worked": len(p["leads"]),
            "enrollments_worked": len(p["enrollments"]),
            "total_actions": p["total"],
            "last_activity": p["last_at"],
            "counts": {c: p["counts"].get(c, 0) for c in SUMMARY_COLUMNS},
        })
    out.sort(key=lambda x: (-x["total_actions"], x["name"]))
    return out
