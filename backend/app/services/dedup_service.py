"""
Duplicate / returning-customer detection for leads.

Rules (super-admin configurable later):
  - Same person  = shares any normalized identifier: phone (incl. alternate),
                   UHID, email, or employee_id.
  - Duplicate    = same person + same calendar month (IST, by created_at)
                   + same service_requested.
  - Returning    = same person but a different month OR a different service.

Detection only FLAGS leads (duplicate_status='pending'); it never deletes.
The super admin confirms ('confirmed') or clears ('not_duplicate').
"""
from datetime import timedelta
from typing import List, Optional
import logging

from app.models.lead import Lead

logger = logging.getLogger(__name__)

IST_OFFSET = timedelta(hours=5, minutes=30)

# Leads in these states are hidden from the Leads page and live in the Duplicates page
HIDDEN_DUP_STATES = ["pending", "confirmed"]


def _norm(v: Optional[str]) -> str:
    return (v or "").strip().lower()


def _norm_phone(v: Optional[str]) -> str:
    digits = "".join(ch for ch in (v or "") if ch.isdigit())
    return digits[-10:] if len(digits) >= 10 else digits


def _phones(lead: Lead) -> set:
    out = set()
    for p in (lead.phone_number, lead.alternate_mobile_number):
        n = _norm_phone(p)
        if n:
            out.add(n)
    return out


def _ist_month(lead: Lead):
    dt = lead.created_at
    if dt is None:
        return None
    ist = dt + IST_OFFSET
    return (ist.year, ist.month)


def same_person(a: Lead, b: Lead) -> List[str]:
    """Return the list of identifiers that match (empty = not the same person)."""
    matched = []
    if _phones(a) & _phones(b):
        matched.append("phone")
    if _norm(a.uhid) and _norm(a.uhid) == _norm(b.uhid):
        matched.append("uhid")
    if _norm(a.email) and _norm(a.email) == _norm(b.email):
        matched.append("email")
    if _norm(a.employee_id) and _norm(a.employee_id) == _norm(b.employee_id):
        matched.append("employee_id")
    return matched


def is_duplicate(a: Lead, b: Lead) -> Optional[List[str]]:
    """Return matched identifiers if a & b are duplicates (same person+month+service)."""
    matched = same_person(a, b)
    if not matched:
        return None
    if _ist_month(a) != _ist_month(b):
        return None
    if _norm(a.service_requested) != _norm(b.service_requested):
        return None
    return matched


async def scan_for_duplicates() -> int:
    """
    Scan active leads; flag later leads in a duplicate group as 'pending'.
    The earliest active lead in each group stays the primary. Idempotent:
    'not_duplicate' leads are never re-flagged, already-flagged leads are skipped.
    Returns the number of newly flagged leads.
    """
    candidates = await Lead.find(
        {"is_deleted": False, "duplicate_status": {"$in": [None, "not_duplicate"]}}
    ).sort("+created_at").to_list()

    primaries: List[Lead] = []
    flagged = 0
    for lead in candidates:
        # 'not_duplicate' leads are kept as primaries but never flagged
        if lead.duplicate_status == "not_duplicate":
            primaries.append(lead)
            continue
        match = next((p for p in primaries if is_duplicate(lead, p)), None)
        if match:
            lead.duplicate_status = "pending"
            lead.duplicate_of = match.lead_id
            await lead.save()
            flagged += 1
        else:
            primaries.append(lead)

    logger.info(f"Duplicate scan complete: {flagged} lead(s) flagged as pending")
    return flagged


async def find_related_leads(lead: Lead) -> List[Lead]:
    """
    Returning-customer history: all other (non-deleted) leads belonging to the
    same person, regardless of month/service. Most recent first.
    """
    others = await Lead.find(
        {"is_deleted": False, "lead_id": {"$ne": lead.lead_id}}
    ).sort("-created_at").to_list()
    return [o for o in others if same_person(lead, o)]
