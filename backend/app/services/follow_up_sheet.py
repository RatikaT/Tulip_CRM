"""
Follow-up Sheet (Summaries page): per SPOC, for the chosen IST dates,
Overdue / Due / Future (1 week) follow-ups and how many were actioned
WITHIN the chosen dates. Everything is judged as it stood on the chosen
dates, so downloading later never changes what happened then.

Agreed rules (product owner, 2026-11-17):
Leads - only "Follow up-In Process" / "Follow up-No Response":
  Overdue = follow-up date before the start date
  Due     = follow-up date within the dates
  Future  = follow-up date in the 7 days after the end date
  (The follow-up date is the one the lead had at the start; a lead with no
  date yet uses the first date set during the period.)
  Actioned = status changed, call added, remark added or follow-up date
  changed, by anyone, within the dates. Owner = owner at the start.
Enrollments - customers whose journey was active at the start, per Nurture
  Buddy at the start. Counted once per customer, most urgent bucket first
  (Overdue > Due > Future), using the Next Follow-up Due date and care steps
  still pending at the start (planned date as it stood then).
  Actioned = call / follow-up logged, care step done / skipped / rescheduled,
  next follow-up date / remarks / feedback changed, journey paused / stopped,
  DNC - within the dates.
"""
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

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

FOLLOW_UP_STATUSES = {"Follow up-In Process", "Follow up-No Response"}
LEAD_ACTIONS = {STATUS, REMARK, CALL_ADDED, FOLLOWUP_DATE}
BUCKETS = ("overdue", "due", "future")


def _d(x) -> Optional[datetime]:
    v = parse_dt(x)
    if v is not None and v.tzinfo is not None:
        v = v.astimezone(timezone.utc).replace(tzinfo=None)
    return v


def _v(x):
    return x.value if hasattr(x, "value") else x


def _day(d) -> str:
    return to_ist(d).strftime("%d %b") if d else "-"


def _when(d) -> str:
    return to_ist(d).strftime("%d %b, %I:%M %p") if d else "-"


def _as_of(current, changes, start):
    """Value at `start`: the 'from' of the first change at/after start, else current."""
    later = sorted((c for c in changes if c[0] >= start), key=lambda c: c[0])
    return later[0][1] if later else current


def _bucket(d, F, T, W):
    if d is None:
        return None
    if d < F:
        return "overdue"
    if d < T:
        return "due"
    if d < W:
        return "future"
    return None


def _empty(name):
    return {"name": name, "counts": {b: [0, 0] for b in BUCKETS}, "items": []}


def _add(rows, key, name, bucket, item):
    r = rows.setdefault(key, _empty(name))
    r["counts"][bucket][0] += 1
    if item["actioned"]:
        r["counts"][bucket][1] += 1
    r["items"].append({**item, "bucket": bucket})


async def build_sheet(start_day, end_day, only_user_id: Optional[str] = None,
                      only_user_name: Optional[str] = None) -> Dict[str, Any]:
    F, T = ist_range_utc(start_day, end_day)
    W = T + timedelta(days=7)
    users = await User.find_all().to_list()
    uname = {str(u.id): u.full_name for u in users}
    by_name = {(u.full_name or "").strip().lower(): str(u.id) for u in users}

    # ============================ LEADS ============================
    leads = await Lead.find({"is_deleted": False,
                             "duplicate_status": {"$in": [None, "not_duplicate"]}}).to_list()
    lead_by_id = {l.lead_id: l for l in leads}
    logs = await AuditLog.find({"timestamp": {"$gte": F}}).to_list()
    st_ch, fu_ch, own_a, own_r = (defaultdict(list) for _ in range(4))
    fu_set_in = defaultdict(list)     # follow-up dates set during the period
    st_in = defaultdict(set)          # statuses held during the period
    acts = defaultdict(list)          # (at, what, by) within the period
    for lg in logs:
        if lg.lead_id not in lead_by_id:
            continue
        for ch in lg.changes or []:
            f = ch.get("field") or ""
            if f == "status":
                st_ch[lg.lead_id].append((lg.timestamp, ch.get("old_value")))
                if lg.timestamp < T:
                    st_in[lg.lead_id].add(ch.get("new_value"))
            elif f == "follow_up_date":
                fu_ch[lg.lead_id].append((lg.timestamp, _d(ch.get("old_value"))))
                if lg.timestamp < T and _d(ch.get("new_value")):
                    fu_set_in[lg.lead_id].append((lg.timestamp, _d(ch.get("new_value"))))
            elif f == "assigned_to":
                own_a[lg.lead_id].append((lg.timestamp, ch.get("old_value")))
            elif f == "reassign_to":
                own_r[lg.lead_id].append((lg.timestamp, ch.get("old_value")))
            if lg.timestamp < T:
                a = classify_lead_change(f, ch.get("new_value"))
                if a in LEAD_ACTIONS:
                    what = {STATUS: f"Status → {ch.get('new_value')}",
                            FOLLOWUP_DATE: "Follow-up date → " + (_when(_d(ch.get("new_value"))) if _d(ch.get("new_value")) else "cleared"),
                            CALL_ADDED: f"{f} added", REMARK: "Remark added"}[a]
                    acts[lg.lead_id].append((lg.timestamp, what, lg.user_name or "Unknown"))

    lead_rows: Dict[str, Dict] = {}
    for l in leads:
        if l.created_at and l.created_at >= T:
            continue
        st0 = _as_of(_v(l.status), st_ch.get(l.lead_id, []), F)
        if l.created_at and l.created_at >= F:
            st0 = None  # didn't exist at the start; judged by statuses held during the period
        if st0 not in FOLLOW_UP_STATUSES and not (st_in.get(l.lead_id, set()) & FOLLOW_UP_STATUSES):
            continue
        fu = _as_of(l.follow_up_date, fu_ch.get(l.lead_id, []), F)
        if fu is None and fu_set_in.get(l.lead_id):
            fu = sorted(fu_set_in[l.lead_id])[0][1]
        b = _bucket(fu, F, T, W)
        if not b:
            continue
        owner = _as_of(l.reassign_to, own_r.get(l.lead_id, []), F) or \
            _as_of(l.assigned_to, own_a.get(l.lead_id, []), F)
        if not owner:
            continue
        done = sorted(acts.get(l.lead_id, []))
        _add(lead_rows, owner, uname.get(owner, "Unknown"), b, {
            "type": "lead", "id": l.lead_id, "name": l.name or "-",
            "status_start": st0 or "(new in period)", "status_now": _v(l.status),
            "date": fu.isoformat(), "date_label": _day(fu),
            "actioned": bool(done),
            "actions": [{"at": a.isoformat(), "what": w, "by": by} for a, w, by in done],
        })

    # ========================== ENROLLMENTS ==========================
    enrs = await Enrollment.find({"is_deleted": False}).to_list()
    enr_by_id = {e.enrollment_id: e for e in enrs}
    elogs = await EnrollmentAuditLog.find({"timestamp": {"$gte": F}}).to_list()
    nfu_ch, spoc_ch, js_ch = defaultdict(list), defaultdict(list), defaultdict(list)
    eacts = defaultdict(list)
    for lg in elogs:
        if lg.enrollment_id not in enr_by_id:
            continue
        for ch in lg.changes or []:
            f = ch.get("field")
            if f == "next_follow_up_date":
                nfu_ch[lg.enrollment_id].append((lg.timestamp, _d(ch.get("old_value"))))
            elif f == "hclhc_spoc":
                spoc_ch[lg.enrollment_id].append((lg.timestamp, ch.get("old_value")))
            elif f == "journey_status":
                js_ch[lg.enrollment_id].append((lg.timestamp, ch.get("old_value")))
            if lg.timestamp < T and _v(lg.action) != "follow_up_added" and \
                    f in ("next_follow_up_date", "remarks", "customer_feedback", "journey_status"):
                what = {"next_follow_up_date": "Next follow-up changed", "remarks": "Remarks edited",
                        "customer_feedback": "Feedback edited",
                        "journey_status": "Journey paused" if ch.get("new_value") == "paused" else "Journey resumed"}[f]
                eacts[lg.enrollment_id].append((lg.timestamp, what, lg.user_name or "Unknown"))

    enr_rows: Dict[str, Dict] = {}
    for e in enrs:
        if e.created_at and e.created_at >= T:
            continue
        eid = e.enrollment_id
        # actions within the period (follow-ups, care steps, stop / DNC) - collected first
        for fu in e.follow_ups or []:
            at = _d(fu.get("created_at"))
            if at and F <= at < T:
                bits = [fu.get("connect_status"), fu.get("action_taken")]
                eacts[eid].append((at, "Follow-up logged" + "".join(f" · {b}" for b in bits if b),
                                   fu.get("created_by_name") or "Unknown"))
        for s in e.journey or []:
            cd = _d(s.get("completed_date"))
            if s.get("status") == "done" and cd and F <= cd < T:
                eacts[eid].append((cd, f"Care step done · {s.get('name')}", s.get("completed_by_name") or "Unknown"))
            for x in s.get("log") or []:
                at = _d(x.get("at"))
                if at and F <= at < T:
                    label = "Care step skipped" if x.get("action") == "skipped" else "Care step rescheduled"
                    eacts[eid].append((at, f"{label} · {s.get('name')}", x.get("by_name") or "Unknown"))
        for t, label, by in ((e.journey_stopped_at, "Journey stopped", e.journey_stopped_by_name),
                             (e.dnc_at if e.do_not_contact else None, "Do Not Contact set", uname.get(e.dnc_set_by or ""))):
            t = _d(t)
            if t and F <= t < T:
                eacts[eid].append((t, label, by or "Unknown"))

        # active at the start?
        if e.do_not_contact and _d(e.dnc_at) and _d(e.dnc_at) < F:
            continue
        if e.journey_status == "stopped" and _d(e.journey_stopped_at) and _d(e.journey_stopped_at) < F:
            continue
        if _as_of(e.journey_status, js_ch.get(eid, []), F) == "paused":
            continue

        # dates as they stood at the start
        nfu = _as_of(_d(e.next_follow_up_date), nfu_ch.get(eid, []), F)
        dates, why = [], {}
        if nfu:
            dates.append(nfu)
            why[nfu] = f"Next Follow-up Due {_day(nfu)}"
        for s in e.journey or []:
            planned = _d(s.get("planned_date"))
            resched = sorted((_d(x.get("at")), _d(x.get("from"))) for x in (s.get("log") or [])
                             if x.get("action") == "rescheduled" and _d(x.get("at")))
            later = [r for r in resched if r[0] >= F]
            if later and later[0][1]:
                planned = later[0][1]
            if not planned:
                continue
            cd = _d(s.get("completed_date")) if s.get("status") == "done" else None
            sk = [_d(x.get("at")) for x in (s.get("log") or []) if x.get("action") == "skipped"]
            pending_at_start = (s.get("status") == "pending" or (cd and cd >= F)
                                or (s.get("status") == "skipped" and sk and max(sk) >= F))
            if pending_at_start:
                dates.append(planned)
                why.setdefault(planned, f"Care step: {s.get('name')} ({_day(planned)})")
        buckets = {b: [d for d in dates if _bucket(d, F, T, W) == b] for b in BUCKETS}
        b = next((x for x in BUCKETS if buckets[x]), None)
        if not b:
            continue
        key_date = min(buckets[b])
        spoc = (_as_of(e.hclhc_spoc, spoc_ch.get(eid, []), F) or "").strip()
        key = by_name.get(spoc.lower()) or ("name:" + (spoc or "(No Nurture Buddy)"))
        done = sorted(eacts.get(eid, []))
        _add(enr_rows, key, uname.get(key) or spoc or "(No Nurture Buddy)", b, {
            "type": "enrollment", "id": eid, "name": e.subscriber_name or e.name or "-",
            "service": e.service_enrolled, "why": why.get(key_date, ""),
            "date": key_date.isoformat(), "date_label": _day(key_date),
            "actioned": bool(done),
            "actions": [{"at": a.isoformat(), "what": w, "by": by} for a, w, by in done],
        })

    def finish(rows):
        out = list(rows.values())
        if only_user_id or only_user_name:
            out = [r for k, r in rows.items()
                   if k == only_user_id or r["name"].strip().lower() == (only_user_name or "").strip().lower()]
        for r in out:
            r["items"].sort(key=lambda i: (BUCKETS.index(i["bucket"]), i["date"]))
        out.sort(key=lambda r: r["name"])
        totals = {b: [sum(r["counts"][b][0] for r in out), sum(r["counts"][b][1] for r in out)] for b in BUCKETS}
        return {"rows": out, "totals": totals}

    return {
        "start": start_day.isoformat(), "end": end_day.isoformat(),
        "future_from": (end_day + timedelta(days=1)).isoformat(),
        "future_to": (end_day + timedelta(days=7)).isoformat(),
        "leads": finish(lead_rows),
        "enrollments": finish(enr_rows),
    }
