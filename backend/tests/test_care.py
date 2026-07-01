"""
Pure-logic tests for care-journey triggers + loop sizing (no DB).

Run: cd backend && python -m tests.test_care
"""
from app.services.journey_ops import compute_care_triggers
from app.services.journey_service import occurrence_offsets, TRIMESTER_HORIZON_DAYS
from app.services.journey_seed import _care_templates
from app.models.lead import Trimester


def _step(steps, step_id):
    return next(s for s in steps if s.step_id == step_id)


def test_triggers_antenatal_blank():
    t = compute_care_triggers("Antenatal", None)
    assert t["needs_trimester"] and not t["trimester_contradiction"]


def test_triggers_antenatal_not_conceived():
    t = compute_care_triggers("Antenatal", "Not Conceived")
    assert t["trimester_contradiction"] and not t["needs_trimester"]


def test_triggers_antenatal_valid_enum():
    # enum trimester must not trip either trigger
    t = compute_care_triggers("Antenatal", Trimester.TRIMESTER_2)
    assert not t["needs_trimester"] and not t["trimester_contradiction"]


def test_triggers_preconception():
    t = compute_care_triggers("PreConception", None)
    assert t["is_preconception"] and not t["needs_trimester"]


def test_preconception_keepintouch_12_months():
    steps = _care_templates()["PreConception"]
    loop = _step(steps, "pc_keepintouch")
    offs = occurrence_offsets(loop, None)
    assert len(offs) == 12, offs               # ~monthly for ~12 months


def test_antenatal_loop_to_trimester_horizon():
    steps = _care_templates()["Antenatal"]
    call = _step(steps, "an_call")             # monthly, horizon=trimester
    t1 = occurrence_offsets(call, {"trimester": "Trimester 1"})
    t3 = occurrence_offsets(call, {"trimester": "Trimester 3"})
    assert max(t1) <= TRIMESTER_HORIZON_DAYS["Trimester 1"]
    assert max(t3) <= TRIMESTER_HORIZON_DAYS["Trimester 3"]
    assert len(t1) > len(t3)                    # T1 (9mo) longer than T3 (3mo)
    # blank trimester -> loop emits nothing (built later when trimester set)
    assert occurrence_offsets(call, None) == []


def test_maternitywellness_loop_count():
    steps = _care_templates()["MaternityWellness"]
    checkin = _step(steps, "mw_checkin")
    assert len(occurrence_offsets(checkin, None)) == 6


def test_legacy_service_normalization():
    # Legacy "Tulip ..." values must resolve to a standard care service so the
    # template lookup (and instantiate) works. Regression for "Tulip Pre-Conception".
    from app.models.journey_template import normalize_service, CARE_SERVICES
    assert normalize_service("Tulip Pre-Conception") == "PreConception"
    assert normalize_service("Tulip Antenatal") == "Antenatal"
    assert normalize_service("Tulip Wellness") == "MaternityWellness"
    assert normalize_service("Tulip Pre-Conception + Antenatal") == "Antenatal"  # combo -> Antenatal
    assert normalize_service("PreConception") == "PreConception"
    for s in CARE_SERVICES:
        assert normalize_service(s) == s


def _run_all():
    fns = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    for fn in fns:
        fn()
        print(f"  PASS {fn.__name__}")
    print(f"\n{len(fns)}/{len(fns)} care tests passed")


if __name__ == "__main__":
    _run_all()
