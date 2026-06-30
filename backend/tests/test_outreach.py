"""
Pure-logic tests for outreach cadences + journey operations (no DB).

Run: cd backend && python -m tests.test_outreach
"""
from datetime import datetime, timedelta

from app.models.journey_template import make_outreach_key, GENERIC_SERVICE
from app.services.journey_seed import _outreach_service_steps, _outreach_generic_steps
from app.services.journey_ops import (
    stop_journey_steps, apply_step_update, add_adhoc_step, remove_step, overdue_pending_steps,
)


def test_outreach_key():
    assert make_outreach_key("Not Interested", "Antenatal") == "Not Interested::Antenatal"
    # Unknown / blank service -> GENERIC
    assert make_outreach_key("Lead Closed-No Response", None) == f"Lead Closed-No Response::{GENERIC_SERVICE}"
    assert make_outreach_key("Follow up-No Response", "SomethingElse") == f"Follow up-No Response::{GENERIC_SERVICE}"


def test_outreach_key_with_enum_status():
    # Regression: lead.status may be a (str, Enum) member at trigger time; the key
    # must use the .value, not the 'LeadStatus.X' f-string form (Python 3.11+).
    from app.models.lead import LeadStatus
    assert make_outreach_key(LeadStatus.NOT_INTERESTED, "Antenatal") == "Not Interested::Antenatal"
    assert make_outreach_key(LeadStatus.LEAD_CLOSED_NO_RESPONSE, None) == f"Lead Closed-No Response::{GENERIC_SERVICE}"


def test_service_cadence_offsets():
    # Service-specific = Mail@15, Mail@30, WhatsApp@30 (final)
    steps = _outreach_service_steps()
    offs = [(s.step_type, s.offset_days) for s in steps]
    assert offs == [("Email", 15), ("Email", 30), ("WhatsApp", 30)], offs


def test_generic_cadence_offsets():
    # Generic = Mail@15, WhatsApp@30, OPTIONAL WhatsApp@45
    steps = _outreach_generic_steps()
    offs = [(s.step_type, s.offset_days, s.is_optional) for s in steps]
    assert offs == [("Email", 15, False), ("WhatsApp", 30, False), ("WhatsApp", 45, True)], offs


def test_stop_keeps_history_drops_pending():
    journey = [
        {"step_id": "a", "status": "done"},
        {"step_id": "b", "status": "skipped"},
        {"step_id": "c", "status": "pending"},
    ]
    out = stop_journey_steps(journey)
    ids = {s["step_id"] for s in out}
    assert ids == {"a", "b"}  # pending dropped, history kept


def test_apply_step_update_done_stamps():
    journey = [{"step_id": "a", "status": "pending"}]
    journey, ok, err = apply_step_update(
        journey, "a", status="done", planned_date=None, notes="called",
        user_id="u1", user_name="Agent A",
    )
    assert ok and err is None
    s = journey[0]
    assert s["status"] == "done" and s["completed_by_name"] == "Agent A" and s["notes"] == "called"


def test_apply_step_update_bad_status():
    journey = [{"step_id": "a", "status": "pending"}]
    _, ok, err = apply_step_update(journey, "a", status="weird", planned_date=None, notes=None, user_id="u", user_name="U")
    assert not ok and "status" in err


def test_add_and_remove_step():
    journey = add_adhoc_step([], name="Extra call", description=None, step_type="Call", planned_date=None)
    assert journey[0]["is_adhoc"] and journey[0]["status"] == "pending"
    sid = journey[0]["step_id"]
    journey, removed = remove_step(journey, sid)
    assert removed and journey == []


def test_overdue_pending():
    now = datetime(2026, 6, 30)
    journey = [
        {"step_id": "past", "status": "pending", "planned_date": now - timedelta(days=2)},
        {"step_id": "future", "status": "pending", "planned_date": now + timedelta(days=2)},
        {"step_id": "done_past", "status": "done", "planned_date": now - timedelta(days=2)},
    ]
    od = overdue_pending_steps(journey, now=now)
    assert [s["step_id"] for s in od] == ["past"]


def _run_all():
    fns = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    for fn in fns:
        fn()
        print(f"  PASS {fn.__name__}")
    print(f"\n{len(fns)}/{len(fns)} outreach tests passed")


if __name__ == "__main__":
    _run_all()
