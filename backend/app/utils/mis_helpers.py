"""
Roll-up helpers for the MIS exports: status/assignment progression from audit
logs, last-activity/latest-remark for leads, and care-journey roll-ups.
"""
from datetime import datetime, date
from app.utils.ist import ist_date


def parse_dt(v):
    """Best-effort parse a value to datetime (handles datetime/date/ISO strings)."""
    if isinstance(v, datetime):
        return v
    if isinstance(v, date):
        return datetime(v.year, v.month, v.day)
    if isinstance(v, str) and v.strip():
        try:
            from dateutil import parser
            return parser.parse(v)
        except Exception:
            return None
    return None


def _val(v):
    return v.value if hasattr(v, "value") else v


def _dedup_consecutive(seq):
    out = []
    for x in seq:
        s = str(x).strip() if x is not None else ""
        if s and (not out or out[-1] != s):
            out.append(s)
    return out


def _ordered_changes(logs, fields):
    """(timestamp, old, new) for audit changes whose field is in `fields`, asc."""
    out = []
    for log in logs:
        ts = getattr(log, "timestamp", None)
        for ch in (getattr(log, "changes", None) or []):
            if ch.get("field") in fields:
                out.append((ts or datetime.min, ch.get("old_value"), ch.get("new_value")))
    out.sort(key=lambda x: x[0] or datetime.min)
    return out


def build_status_path(lead, logs):
    """Ordered status progression 'A → B → C' (creation status + status changes)."""
    changes = _ordered_changes(logs, {"status"})
    seq = []
    if changes:
        seq.append(changes[0][1])            # initial = first change's old value
        seq.extend(nv for _, _, nv in changes)
    else:
        seq.append(_val(lead.status))
    return " → ".join(_dedup_consecutive(seq))


def build_assigned_chain(lead, logs):
    """Ordered agent chain 'X → Y' from assignment/reassignment name changes."""
    changes = _ordered_changes(logs, {"assigned_to_name", "reassign_to_name", "reassigned_to_name"})
    seq = []
    if changes:
        seq.append(changes[0][1])
        seq.extend(nv for _, _, nv in changes)
    chain = _dedup_consecutive(seq)
    if not chain and lead.assigned_to_name:
        chain = [lead.assigned_to_name]
    return " → ".join(chain)


def lead_last_activity(lead):
    cands = [lead.created_at, lead.updated_at]
    for call in (lead.calls or []):
        cands.append(parse_dt(call.get("date_time")))
    for cm in (lead.comments or []):
        cands.append(parse_dt(cm.get("created_at")))
    cands = [c for c in cands if isinstance(c, datetime)]
    return max(cands) if cands else None


def lead_latest_remark(lead):
    comments = lead.comments or []
    if not comments:
        return None
    best_text, best_dt = None, None
    for cm in comments:
        dt = parse_dt(cm.get("created_at"))
        if best_dt is None or (dt and dt > best_dt):
            best_text, best_dt = cm.get("text"), dt
    return best_text if best_text is not None else comments[-1].get("text")


def care_rollups(enrollment, today):
    """
    Care-journey roll-ups. Ignores steps unless journey_status == 'active'.
    Pending steps with planned_date < today are overdue.
    """
    journey = getattr(enrollment, "journey", None) or []
    empty = {
        "progress": "—", "done": 0, "total": len(journey), "overdue": 0,
        "next_step": None, "next_due": None, "last_step": None, "last_on": None,
    }
    if getattr(enrollment, "journey_status", "active") != "active" or not journey:
        return empty

    total = len(journey)
    done = sum(1 for s in journey if s.get("status") == "done")

    pending = []
    for s in journey:
        if s.get("status") == "pending":
            d = parse_dt(s.get("planned_date"))
            if d:
                pending.append((d, s))
    pending.sort(key=lambda x: x[0])
    next_step = pending[0][1].get("name") if pending else None
    next_due = pending[0][0] if pending else None
    overdue = sum(1 for d, _ in pending if ist_date(d) < today)

    completed = []
    for s in journey:
        if s.get("status") == "done":
            d = parse_dt(s.get("completed_date"))
            if d:
                completed.append((d, s))
    completed.sort(key=lambda x: x[0])
    last_step = completed[-1][1].get("name") if completed else None
    last_on = completed[-1][0] if completed else None

    return {
        "progress": f"{done}/{total}", "done": done, "total": total, "overdue": overdue,
        "next_step": next_step, "next_due": next_due, "last_step": last_step, "last_on": last_on,
    }
