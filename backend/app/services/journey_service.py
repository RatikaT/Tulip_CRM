"""
Journey engine.

Snapshots a (context, trigger_key) template onto a Lead or Enrollment as a flat,
dated checklist. Recurring template steps are MATERIALIZED into concrete dated
occurrences here (the instance never stores live recurrence).

Scheduling rules (deterministic):
  - One-off step:   planned = anchor + offset_days.
  - Recurring step: occurrences at offset, offset+rec, offset+2*rec, ... until
                    recurrence_count is reached OR the horizon is reached.
  - Trimester horizon (Antenatal): loop runs to delivery — T1 ~9mo, T2 ~6mo,
                    T3 ~3mo from anchor. A recurring step with horizon="trimester"
                    and no valid trimester in ctx emits NOTHING (the loop is only
                    built once the agent sets a trimester).
  - Weekend skip:   a planned date on Sat/Sun moves to the next Monday.
  - 15-day cap:     no two touchpoints (across ALL of a person's journeys) within
                    15 days — a colliding date is pushed forward to the next free
                    weekday slot. Caller passes `existing_dates` from the person's
                    other journeys to enforce this across journeys.
  - Do-Not-Contact: generates nothing.
"""
import logging
import re
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from app.models.journey_template import (
    JourneyTemplate,
    JourneyContext,
    JourneyStepDef,
    CARE_SERVICES,
    normalize_service,
)

logger = logging.getLogger(__name__)

# Antenatal loop length from the enrollment anchor, assuming enrollment at the
# START of the stated trimester (3 trimesters x 3 months = 9 months to delivery).
TRIMESTER_HORIZON_DAYS = {
    "Trimester 1": 270,   # ~9 months
    "Trimester 2": 180,   # ~6 months
    "Trimester 3": 90,    # ~3 months
}

MIN_GAP_DAYS = 15         # frequency cap across all of a person's journeys
_RUNAWAY_CAP = 60         # safety bound when a recurring step has neither count nor horizon


# --------------------------------------------------------------------------- #
# Pure date helpers (no DB — unit-testable)
# --------------------------------------------------------------------------- #
def skip_weekend(d: datetime) -> datetime:
    """Move a Sat/Sun date forward to the following Monday."""
    wd = d.weekday()          # Mon=0 .. Sun=6
    if wd == 5:               # Saturday
        return d + timedelta(days=2)
    if wd == 6:               # Sunday
        return d + timedelta(days=1)
    return d


def apply_frequency_cap(d: datetime, scheduled: List[datetime], min_gap: int = MIN_GAP_DAYS) -> datetime:
    """
    Push `d` forward until it is a weekday AND at least `min_gap` days away from
    every already-scheduled date. Deterministic: always moves forward, never back.
    """
    d = skip_weekend(d)
    moved = True
    while moved:
        moved = False
        for s in scheduled:
            if abs((d.date() - s.date()).days) < min_gap:
                d = skip_weekend(s + timedelta(days=min_gap))
                moved = True
                break
    return d


def occurrence_offsets(step: JourneyStepDef, ctx: Optional[Dict[str, Any]]) -> List[int]:
    """
    Day-offsets (from anchor) at which this step occurs. One-off -> [offset].
    Recurring -> expanded list bounded by recurrence_count and/or horizon.
    """
    base = step.offset_days or 0
    if not step.recurrence_days:
        return [base]

    horizon_days: Optional[int] = None
    if step.horizon == "trimester":
        trimester = (ctx or {}).get("trimester")
        horizon_days = TRIMESTER_HORIZON_DAYS.get(trimester)
        if horizon_days is None:
            # Antenatal loop with no valid trimester yet -> build nothing now.
            return []

    offsets: List[int] = []
    i = 0
    while True:
        if step.recurrence_count is not None and i >= step.recurrence_count:
            break
        off = base + i * step.recurrence_days
        if horizon_days is not None and off > horizon_days:
            break
        if step.recurrence_count is None and horizon_days is None and i >= _RUNAWAY_CAP:
            break
        offsets.append(off)
        i += 1
    return offsets


def expand_steps(
    steps: List[JourneyStepDef],
    anchor: datetime,
    ctx: Optional[Dict[str, Any]] = None,
    existing_dates: Optional[List[datetime]] = None,
) -> List[Dict[str, Any]]:
    """
    Materialize template steps into dated instance steps (pure; no DB).
    Applies weekend-skip and the cross-journey 15-day frequency cap.
    """
    scheduled: List[datetime] = list(existing_dates or [])
    out: List[Dict[str, Any]] = []

    for step in sorted(steps, key=lambda s: s.order):
        offsets = occurrence_offsets(step, ctx)
        for occ_idx, off in enumerate(offsets):
            planned = apply_frequency_cap(anchor + timedelta(days=off), scheduled)
            scheduled.append(planned)
            # Unique id per occurrence so PUT /{step_id} can target it.
            inst_id = step.step_id if (not step.recurrence_days and occ_idx == 0) else f"{step.step_id}-{occ_idx}"
            out.append({
                "step_id": inst_id,
                "template_step_id": step.step_id,
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
                "occurrence_index": occ_idx,
                "is_optional": bool(step.is_optional),
                "is_adhoc": False,
            })

    out.sort(key=lambda s: s["planned_date"])
    return out


# --------------------------------------------------------------------------- #
# DB-backed template lookup + journey build
# --------------------------------------------------------------------------- #
async def get_template(context: str, trigger_key: str) -> Optional[JourneyTemplate]:
    """Find the template for (context, trigger_key). If duplicates exist, return the
    one with the most steps (newest as tie-break) so an empty duplicate never wins."""
    if not trigger_key:
        return None
    matches = await JourneyTemplate.find(
        {"context": context, "trigger_key": trigger_key}
    ).to_list()
    if not matches:
        return None
    matches.sort(
        key=lambda t: (len(t.steps or []), t.updated_at or datetime.min),
        reverse=True,
    )
    return matches[0]


async def build_journey(
    context: str,
    trigger_key: str,
    anchor: datetime,
    *,
    ctx: Optional[Dict[str, Any]] = None,
    existing_dates: Optional[List[datetime]] = None,
    do_not_contact: bool = False,
) -> List[Dict[str, Any]]:
    """Build a journey-instance list (snapshot) for a (context, trigger_key)."""
    if do_not_contact:
        return []
    template = await get_template(context, trigger_key)
    if not template or not template.steps:
        return []
    journey = expand_steps(template.steps, anchor, ctx=ctx, existing_dates=existing_dates)
    logger.info(
        f"Built {len(journey)} step(s) for context={context} trigger_key={trigger_key}"
    )
    return journey


def _canonical_service(service: Optional[str]) -> Optional[str]:
    # Map legacy / packaged service values ("Tulip Pre-Conception", combos, casing)
    # to a standardized care service so the template lookup resolves.
    if not service:
        return service
    return normalize_service(service)


async def build_journey_for_service(
    service: Optional[str],
    anchor_date: datetime,
    ctx: Optional[Dict[str, Any]] = None,
    existing_dates: Optional[List[datetime]] = None,
    do_not_contact: bool = False,
) -> List[Dict[str, Any]]:
    """
    Backward-compatible care-journey builder (used by enrollment_helpers and the
    instantiate endpoint). Delegates to build_journey(context="care", ...).
    """
    return await build_journey(
        JourneyContext.CARE.value,
        _canonical_service(service),
        anchor_date,
        ctx=ctx,
        existing_dates=existing_dates,
        do_not_contact=do_not_contact,
    )


# Kept for any callers importing the old name.
async def get_template_for_service(service: Optional[str]) -> Optional[JourneyTemplate]:
    if not service or not service.strip():
        return None
    return await get_template(JourneyContext.CARE.value, _canonical_service(service))
