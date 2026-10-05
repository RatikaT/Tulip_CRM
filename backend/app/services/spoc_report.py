"""
Daily SPOC Report: for chosen IST days, what each SPOC had to act on and
whether it was acted on. Feeds the Summaries page (report + scorecard), its
Excel export, saved reports and the AI note.

Agreed rules (product owner, 2026-09-28/29):
- Leads, per current owner (reassigned-to, else assigned-to):
    New      = assigned / reassigned to them in the dates
    Due      = follow-up date (as it stood at the start of the dates) falls in the dates
    Overdue  = follow-up date before the dates, and nothing done on the lead since that date
  A lead counts once: New > Due > Overdue. Closed leads (as of the start) are not due/overdue.
  Acted on = status changed, remark added, call added, follow-up date changed, outreach
  step done, journey stopped or DNC - by anyone, in the dates.
- Enrollments, per HCLH SPOC (Nurture Buddy):
    Due      = Next Follow-up Due or a care step planned in the dates
    Overdue  = Next Follow-up Due before the dates with nothing done since, or a care step
               planned before the dates still not done at the start of the dates
  A customer counts once (Due > Overdue). DNC / stopped before the dates -> not counted.
  Acted on = follow-up logged, next follow-up date / remarks / feedback changed, care step
  done / skipped / rescheduled, journey stopped or DNC - by anyone, in the dates.
- "Where the new leads stand now" uses today's status.
"""
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.models.audit_log import AuditLog
from app.models.enrollment import Enrollment
from app.models.enrollment_audit_log import EnrollmentAuditLog
from app.models.lead import Lead
from app.models.user import User
from app.services.activity_log import (
    CALL_ADDED, FOLLOWUP_DATE, REMARK, STATUS, classify_lead_change,
)
from app.utils.ist import ist_range_utc, to_ist
from app.utils.mis_helpers import parse_dt

CLOSED_STATUSES = {"Enrolled", "Not Interested", "Lead Closed-No Response", "Duplicate"}
NO_SALE_STATUSES = {"Not Interested", "Lead Closed-No Response"}
LEAD_ACTIONS = {STATUS, REMARK, CALL_ADDED, FOLLOWUP_DATE}
ENR_ACTION_FIELDS = {"next_follow_up_date", "remarks", "customer_feedback", "journey_status"}
BUCKETS = ("newL", "due", "over", "enrDue", "enrOver")
NO_BUDDY = "(No Nurture Buddy)"


def _v(x):
    return x.value if hasattr(x, "value") else x


def _d(x) -> Optional[datetime]:
    """Stored value -> naive UTC datetime."""
    d = parse_dt(x)
    if d is not None and d.tzinfo is not None:
        d = d.astimezone(timezone.utc).replace(tzinfo=None)
    return d


def _fmt_day(d: Optional[datetime]) -> str:
    return to_ist(d).strftime("%d %b") if d else "-"


def _fmt_dt(d: Optional[datetime]) -> str:
    return to_ist(d).strftime("%d %b, %I:%M %p") if d else "-"


def _as_of(current, changes: List[Tuple[datetime, Any]], start: datetime):
    """Value of a field at `start`: the 'from' of the first change at/after start, else current."""
    later = sorted((c for c in changes if c[0] >= start), key=lambda c: c[0])
    return later[0][1] if later else current


class _Acts:
    """Actions per record: list of (at, what, by)."""
    def __init__(self):
        self.by_rec: Dict[str, List[Tuple[datetime, str, str]]] = defaultdict(list)

    def add(self, rec, at, what, by):
        if at is not None:
            self.by_rec[rec].append((at, what, by or "Unknown"))

    def in_range(self, rec, f, t):
        return sorted([a for a in self.by_rec.get(rec, []) if f <= a[0] < t], key=lambda a: a[0])

    def any_between(self, rec, f, t):
        return any(f <= a[0] < t for a in self.by_rec.get(rec, []))


def _lead_action_label(field: str, action: str, new) -> str:
    if action == STATUS:
        return f"Status → {new}"
    if action == FOLLOWUP_DATE:
        d = _d(new)
        return f"Follow-up date → {_fmt_dt(d)}" if d else "Follow-up date cleared"
    if action == CALL_ADDED:
        return f"{field} added"
    return "Remark added"


def _step_log_actions(steps) -> List[Tuple[datetime, str, str]]:
    out = []
    for s in steps or []:
        name = s.get("name") or "Care step"
        if s.get("status") == "done" and s.get("completed_date"):
            out.append((_d(s["completed_date"]), f"Step done · {name}", s.get("completed_by_name")))
        for e in s.get("log") or []:
            if e.get("action") in ("skipped", "rescheduled"):
                label = "Step skipped" if e["action"] == "skipped" else f"Step rescheduled → {_fmt_day(_d(e.get('to')))}"
                out.append((_d(e.get("at")), f"{label} · {name}", e.get("by_name")))
    return [o for o in out if o[0] is not None]


async def build_report(start_day, end_day, *, only_user_id: Optional[str] = None,
                       with_trend: bool = True) -> Dict[str, Any]:
    F, T = ist_range_utc(start_day, end_day)
    from app.routers.enrollments import resume_due_pauses
    await resume_due_pauses()
    users = await User.find_all().to_list()
    uname = {str(u.id): u.full_name for u in users}
    by_name = {(u.full_name or "").strip().lower(): str(u.id) for u in users}
    agents = [str(u.id) for u in users if _v(getattr(u, "role", None)) == "agent"
              and getattr(u, "is_active", True)]

    leads = await Lead.find({"is_deleted": False,
                             "duplicate_status": {"$in": [None, "not_duplicate"]}}).to_list()
    enrs = await Enrollment.find({"is_deleted": False}).to_list()
    now = datetime.utcnow()

    core = await _compute(F, T, leads, enrs, uname, by_name)
    rows = core["rows"]

    # Every active agent gets a row, even with nothing to do
    for uid in agents:
        rows.setdefault(uid, _empty_row(uid, uname.get(uid)))

    # Trend: one line per day when several days are chosen
    days = (end_day - start_day).days + 1
    if with_trend and 2 <= days <= 31:
        for i in range(days):
            d = start_day + timedelta(days=i)
            f, t = ist_range_utc(d, d)
            if f > now:
                break
            day = await _compute(f, t, leads, enrs, uname, by_name, light=True)
            for key, r in rows.items():
                c = day["rows"].get(key, {}).get("counts", {})
                r.setdefault("trend", []).append({"date": d.isoformat(), "total": c.get("total", 0),
                                                  "acted": c.get("acted", 0)})

    # Portfolio (as of today)
    lead_own = Counter((l.reassign_to or l.assigned_to) for l in leads)
    enr_own = Counter(_buddy_key(e, by_name) for e in enrs)
    for key, r in rows.items():
        r["portfolio"] = {"leads": lead_own.get(key, 0), "enrollments": enr_own.get(key, 0)}

    out_rows = [r for r in rows.values() if not only_user_id or r["user_id"] == only_user_id]
    out_rows.sort(key=lambda r: (-r["counts"]["total"], r["name"] or ""))
    totals = {k: sum(r["counts"][k] for r in out_rows) for k in
              (*BUCKETS, "total", "acted", "not")}

    created = [l for l in leads if l.created_at and F <= l.created_at < T]
    return {
        "start": start_day.isoformat(), "end": end_day.isoformat(), "days": days,
        "generated_at": now.isoformat(),
        "headline": {
            "new_leads_created": len(created),
            "assigned": sum(1 for l in created if l.reassign_to or l.assigned_to),
            "unassigned": sum(1 for l in created if not (l.reassign_to or l.assigned_to)),
        },
        "rows": out_rows,
        "totals": totals,
    }


def _buddy_key(e, by_name) -> str:
    name = (e.hclhc_spoc or "").strip()
    if not name:
        return "name:" + NO_BUDDY
    return by_name.get(name.lower()) or "name:" + name


def _empty_row(key, name):
    return {
        "user_id": key if not key.startswith("name:") else None,
        "name": name or (key[5:] if key.startswith("name:") else "Unknown"),
        "counts": {**{b: 0 for b in BUCKETS}, "total": 0, "acted": 0, "not": 0},
        "split": {b: [0, 0] for b in BUCKETS},
        "items": [], "extra": [],
        "new_status": {},
        "results": {"enrolled": 0, "closed": 0, "closed_reasons": {}, "enrolled_list": [], "closed_list": []},
        "care": {"planned": 0, "done": 0, "rescheduled": 0, "skipped": 0, "pending": 0,
                 "overdue_before": 0, "done_ahead": 0},
        "last_action_at": None,
    }


async def _compute(F, T, leads, enrs, uname, by_name, light=False) -> Dict[str, Any]:
    rows: Dict[str, Dict] = {}

    def row(key):
        if key not in rows:
            rows[key] = _empty_row(key, uname.get(key))
        return rows[key]

    # ======================= LEADS =======================
    lead_by_id = {l.lead_id: l for l in leads}
    audits = await AuditLog.find({"timestamp": {"$gte": F}}).to_list()
    fu_changes, st_changes = defaultdict(list), defaultdict(list)
    acts = _Acts()
    results = []  # (actor_key, kind, lead, at, by)
    for lg in audits:
        if lg.lead_id not in lead_by_id:
            continue
        for ch in lg.changes or []:
            field = ch.get("field") or ""
            if field == "follow_up_date":
                fu_changes[lg.lead_id].append((lg.timestamp, _d(ch.get("old_value"))))
            if field == "status":
                st_changes[lg.lead_id].append((lg.timestamp, ch.get("old_value")))
                if F <= lg.timestamp < T and ch.get("new_value") in (NO_SALE_STATUSES | {"Enrolled"}):
                    results.append((lg.user_id, ch.get("new_value"), lead_by_id[lg.lead_id], lg.timestamp, lg.user_name))
            action = classify_lead_change(field, ch.get("new_value"))
            if action in LEAD_ACTIONS and lg.timestamp < T:
                acts.add(lg.lead_id, lg.timestamp, _lead_action_label(field, action, ch.get("new_value")), lg.user_name)
    for l in leads:
        for at, what, by in _step_log_actions(l.journey):
            acts.add(l.lead_id, at, what.replace("Step", "Outreach step", 1), by)
        if l.journey_stopped_at:
            acts.add(l.lead_id, l.journey_stopped_at, "Outreach journey stopped", l.journey_stopped_by_name)
        if getattr(l, "do_not_contact", False) and l.dnc_at:
            acts.add(l.lead_id, l.dnc_at, "Do Not Contact set", uname.get(getattr(l, "dnc_set_by", None) or ""))

    # Overdue needs "nothing done since the follow-up date" - load older actions for candidates
    cand, min_fu = {}, None
    for l in leads:
        fu = _as_of(l.follow_up_date, fu_changes.get(l.lead_id, []), F)
        st = _as_of(_v(l.status), st_changes.get(l.lead_id, []), F)
        cand[l.lead_id] = (fu, st)
        if fu and fu < F and st not in CLOSED_STATUSES:
            min_fu = fu if min_fu is None or fu < min_fu else min_fu
    if min_fu is not None:
        older = await AuditLog.find({"timestamp": {"$gte": min_fu, "$lt": F},
                                     "lead_id": {"$in": [k for k, (fu, st) in cand.items()
                                                         if fu and fu < F and st not in CLOSED_STATUSES]}}).to_list()
        for lg in older:
            for ch in lg.changes or []:
                action = classify_lead_change(ch.get("field") or "", ch.get("new_value"))
                if action in LEAD_ACTIONS:
                    acts.add(lg.lead_id, lg.timestamp, "", lg.user_name)

    listed = set()
    for l in leads:
        owner = l.reassign_to or l.assigned_to
        if not owner:
            continue
        fu, st = cand[l.lead_id]
        # When it reached its current owner. Bulk-uploaded leads never got an
        # assigned date, so fall back to when the lead was created.
        stamps = [d for d in (l.reassigned_date, l.assigned_date or (l.created_at if l.assigned_to else None)) if d]
        given = max(stamps) if stamps else None
        bucket, why = None, ""
        if given and F <= given < T:
            bucket, why = "newL", f"Assigned {_fmt_dt(given)}"
        elif st not in CLOSED_STATUSES and fu and F <= fu < T:
            bucket, why = "due", f"Follow-up due {_fmt_dt(fu)}"
        elif st not in CLOSED_STATUSES and fu and fu < F and not acts.any_between(l.lead_id, fu, F):
            bucket, why = "over", f"Was due {_fmt_day(fu)}"
        if not bucket:
            continue
        listed.add(l.lead_id)
        _add_item(row(owner), bucket, "lead", l.lead_id, l.name, why, acts.in_range(l.lead_id, F, T), light)
        if bucket == "newL" and not light:
            r = row(owner)
            r["new_status"][_v(l.status) or "-"] = r["new_status"].get(_v(l.status) or "-", 0) + 1

    # ======================= ENROLLMENTS =======================
    enr_by_id = {e.enrollment_id: e for e in enrs}
    e_audits = await EnrollmentAuditLog.find({"timestamp": {"$gte": F}}).to_list()
    nfu_changes = defaultdict(list)
    e_acts = _Acts()
    for lg in e_audits:
        if lg.enrollment_id not in enr_by_id:
            continue
        for ch in lg.changes or []:
            f = ch.get("field")
            if f == "next_follow_up_date":
                nfu_changes[lg.enrollment_id].append((lg.timestamp, _d(ch.get("old_value"))))
            if f in ENR_ACTION_FIELDS and lg.timestamp < T and _v(lg.action) != "follow_up_added":
                label = {"next_follow_up_date": "Next follow-up changed", "remarks": "Remarks edited",
                         "customer_feedback": "Feedback edited",
                         "journey_status": "Journey paused" if ch.get("new_value") == "paused" else "Journey resumed"}[f]
                e_acts.add(lg.enrollment_id, lg.timestamp, label, lg.user_name)
    for e in enrs:
        for fu in e.follow_ups or []:
            at = _d(fu.get("created_at"))
            what = "Follow-up logged" + (f" · {fu.get('connect_status')}" if fu.get("connect_status") else "")
            e_acts.add(e.enrollment_id, at, what, fu.get("created_by_name"))
        for at, what, by in _step_log_actions(e.journey):
            e_acts.add(e.enrollment_id, at, what, by)
        if e.journey_stopped_at:
            e_acts.add(e.enrollment_id, e.journey_stopped_at, "Care journey stopped", e.journey_stopped_by_name)
        if e.do_not_contact and e.dnc_at:
            e_acts.add(e.enrollment_id, e.dnc_at, "Do Not Contact set", uname.get(e.dnc_set_by or "", None))

    # older enrollment actions for "nothing done since" (remarks/feedback/next-date edits)
    nfu_asof = {e.enrollment_id: _as_of(_d(e.next_follow_up_date), nfu_changes.get(e.enrollment_id, []), F)
                for e in enrs}
    e_cands = [i for i, d in nfu_asof.items() if d and d < F]
    if e_cands:
        mins = min(nfu_asof[i] for i in e_cands)
        for lg in await EnrollmentAuditLog.find({"timestamp": {"$gte": mins, "$lt": F},
                                                 "enrollment_id": {"$in": e_cands}}).to_list():
            if any((ch.get("field") in ENR_ACTION_FIELDS) for ch in lg.changes or []):
                e_acts.add(lg.enrollment_id, lg.timestamp, "", lg.user_name)

    for e in enrs:
        if e.do_not_contact and e.dnc_at and _d(e.dnc_at) < F:
            continue
        # Paused before the dates: not to be contacted until it resumes
        if e.journey_status == "paused" and e.paused_at and _d(e.paused_at) < F:
            continue
        # Stopped before the dates (a journey rebuilt after a stop is active again)
        if e.journey_status == "stopped" and e.journey_stopped_at and _d(e.journey_stopped_at) < F:
            continue
        key = _buddy_key(e, by_name)
        nfu = nfu_asof[e.enrollment_id]
        steps_due, steps_over = [], []
        for s in e.journey or []:
            pd = _d(s.get("planned_date"))
            if not pd:
                continue
            done_at = _d(s.get("completed_date")) if s.get("status") == "done" else None
            skipped_at = max([_d(x.get("at")) for x in (s.get("log") or []) if x.get("action") == "skipped"] or [None], key=lambda x: x or datetime.min)
            open_at_start = (s.get("status") == "pending" or (done_at and done_at >= F)
                             or (s.get("status") == "skipped" and skipped_at and skipped_at >= F))
            if F <= pd < T and open_at_start:
                steps_due.append(s)
            elif pd < F and open_at_start:
                steps_over.append(s)
            if not light:
                c = row(key)["care"]
                if F <= pd < T:
                    c["planned"] += 1
                    st = s.get("status")
                    c["done" if st == "done" else "skipped" if st == "skipped" else "pending"] += 1
                elif pd < F and s.get("status") == "pending":
                    c["overdue_before"] += 1
                if done_at and F <= done_at < T and pd >= T:
                    c["done_ahead"] += 1
                c["rescheduled"] += sum(1 for x in (s.get("log") or []) if x.get("action") == "rescheduled"
                                        and _d(x.get("at")) and F <= _d(x.get("at")) < T)
        bucket, why = None, ""
        if nfu and F <= nfu < T:
            bucket, why = "enrDue", f"Next Follow-up Due {_fmt_dt(nfu)}"
        elif steps_due:
            bucket, why = "enrDue", f"Care step: {steps_due[0].get('name')} ({_fmt_day(_d(steps_due[0].get('planned_date')))})"
        elif nfu and nfu < F and not e_acts.any_between(e.enrollment_id, nfu, F):
            bucket, why = "enrOver", f"Next Follow-up was due {_fmt_day(nfu)}"
        elif steps_over:
            s0 = min(steps_over, key=lambda s: _d(s.get("planned_date")))
            bucket, why = "enrOver", f"Care step overdue: {s0.get('name')} (planned {_fmt_day(_d(s0.get('planned_date')))})"
        if not bucket:
            continue
        listed.add(e.enrollment_id)
        _add_item(row(key), bucket, "enrollment", e.enrollment_id, e.subscriber_name or e.name, why,
                  e_acts.in_range(e.enrollment_id, F, T), light)

    if light:
        return {"rows": rows}

    # Results: enrolled / closed, credited to who did it
    for uid, kind, l, at, by in results:
        key = uid or "name:" + (by or "Unknown")
        r = row(key)
        if key.startswith("name:"):
            r["name"] = by or "Unknown"
        entry = {"id": l.lead_id, "name": l.name, "at": at.isoformat(), "by": by}
        if kind == "Enrolled":
            r["results"]["enrolled"] += 1
            r["results"]["enrolled_list"].append(entry)
        else:
            reason = _v(l.reason_for_no_sale) or "Not specified"
            r["results"]["closed"] += 1
            r["results"]["closed_reasons"][reason] = r["results"]["closed_reasons"].get(reason, 0) + 1
            r["results"]["closed_list"].append({**entry, "reason": reason, "status": kind})

    # Other work: actions in the dates on records that weren't on anyone's list
    for rec, lst in list(acts.by_rec.items()):
        if rec in listed:
            continue
        done = [a for a in lst if F <= a[0] < T and a[1]]
        l = lead_by_id.get(rec)
        if done and l and (l.reassign_to or l.assigned_to):
            row(l.reassign_to or l.assigned_to)["extra"].append(_item("lead", rec, l.name, "", "", done))
    for rec, lst in list(e_acts.by_rec.items()):
        if rec in listed:
            continue
        done = [a for a in lst if F <= a[0] < T and a[1]]
        e = enr_by_id.get(rec)
        if done and e:
            row(_buddy_key(e, by_name))["extra"].append(_item("enrollment", rec, e.subscriber_name or e.name, "", "", done))

    for r in rows.values():
        ats = [a["at"] for it in r["items"] + r["extra"] for a in it["actions"]]
        r["last_action_at"] = max(ats) if ats else None
    return {"rows": rows}


def _item(kind, rec_id, name, bucket, why, actions):
    return {
        "type": kind, "id": rec_id, "name": name or "-", "bucket": bucket, "why": why,
        "acted": bool(actions),
        "actions": [{"at": a[0].isoformat(), "what": a[1], "by": a[2]} for a in actions if a[1]],
    }


def _add_item(r, bucket, kind, rec_id, name, why, actions, light):
    acted = bool([a for a in actions if a[1] is not None])
    r["split"][bucket][0] += 1
    r["counts"][bucket] += 1
    r["counts"]["total"] += 1
    if acted:
        r["split"][bucket][1] += 1
        r["counts"]["acted"] += 1
    else:
        r["counts"]["not"] += 1
    if not light:
        r["items"].append(_item(kind, rec_id, name, bucket, why, actions))
