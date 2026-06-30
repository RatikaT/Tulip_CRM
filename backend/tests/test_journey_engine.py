"""
Pure-logic tests for the journey engine (no DB needed).

Run:  cd backend && python -m tests.test_journey_engine
(Also importable by pytest as test_* functions.)
"""
from datetime import datetime, timedelta

from app.services.journey_service import (
    skip_weekend,
    apply_frequency_cap,
    occurrence_offsets,
    expand_steps,
    TRIMESTER_HORIZON_DAYS,
    MIN_GAP_DAYS,
)
from app.models.journey_template import JourneyStepDef, StepType


def _mk(name, offset, order, **kw):
    return JourneyStepDef(step_id=name, name=name, step_type=StepType.OTHER.value,
                          offset_days=offset, order=order, **kw)


def test_skip_weekend():
    # 2026-07-04 is a Saturday, 07-05 Sunday, 07-06 Monday
    sat = datetime(2026, 7, 4)
    sun = datetime(2026, 7, 5)
    mon = datetime(2026, 7, 6)
    assert skip_weekend(sat) == mon
    assert skip_weekend(sun) == mon
    assert skip_weekend(mon) == mon


def test_frequency_cap_min_gap():
    base = datetime(2026, 3, 2)  # Monday
    scheduled = [base]
    d = apply_frequency_cap(base + timedelta(days=5), scheduled)  # within 15 days -> push
    assert (d.date() - base.date()).days >= MIN_GAP_DAYS
    assert d.weekday() < 5  # weekday


def test_no_two_touchpoints_within_15_days():
    anchor = datetime(2026, 3, 2)  # Monday
    steps = [
        _mk("a", 0, 0),
        _mk("b", 3, 1),    # 3 days after a -> must be pushed >=15
        _mk("c", 10, 2),   # 10 days -> pushed
    ]
    out = expand_steps(steps, anchor)
    dates = sorted(s["planned_date"].date() for s in out)
    for i in range(1, len(dates)):
        assert (dates[i] - dates[i - 1]).days >= MIN_GAP_DAYS, dates
    for s in out:
        assert s["planned_date"].weekday() < 5


def test_recurrence_count():
    step = _mk("loop", 30, 0, recurrence_days=30, recurrence_count=12)
    offs = occurrence_offsets(step, None)
    assert len(offs) == 12
    assert offs[0] == 30 and offs[1] == 60 and offs[-1] == 30 + 11 * 30


def test_trimester_horizon_sizes():
    # Antenatal monthly call, horizon=trimester
    step = _mk("call", 30, 0, recurrence_days=30, horizon="trimester")
    # T1 ~270 days -> offsets 30,60,...,<=270
    offs_t1 = occurrence_offsets(step, {"trimester": "Trimester 1"})
    assert max(offs_t1) <= TRIMESTER_HORIZON_DAYS["Trimester 1"]
    assert max(offs_t1) > TRIMESTER_HORIZON_DAYS["Trimester 2"]  # longer than T2
    offs_t3 = occurrence_offsets(step, {"trimester": "Trimester 3"})
    assert max(offs_t3) <= TRIMESTER_HORIZON_DAYS["Trimester 3"]
    # No trimester -> loop emits nothing (built later when agent sets trimester)
    assert occurrence_offsets(step, None) == []
    assert occurrence_offsets(step, {"trimester": "Not Conceived"}) == []


def test_one_off_step_always_emits():
    step = _mk("welcome", 0, 0)
    assert occurrence_offsets(step, None) == [0]


def _run_all():
    fns = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    passed = 0
    for fn in fns:
        fn()
        print(f"  PASS {fn.__name__}")
        passed += 1
    print(f"\n{passed}/{len(fns)} engine tests passed")


if __name__ == "__main__":
    _run_all()
