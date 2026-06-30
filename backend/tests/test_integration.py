"""
Integration tests against a throwaway local Mongo (localhost:27017).

Exercises the real DB-backed journey flows: seeding, outreach build (service +
generic), DNC hard-stop, care trimester re-instantiation preserving progress,
and conversion stop. Run:

    cd backend && python -m tests.test_integration

Safe: uses a dedicated test database that is dropped before and after.
"""
import asyncio
from datetime import datetime, timedelta

from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie

import app.database as database_module
from app.models.user import User
from app.models.lead import Lead, LeadStatus
from app.models.enrollment import Enrollment
from app.models.journey_template import JourneyTemplate

from app.services.journey_seed import migrate_and_seed_journeys
from app.services.journey_ops import build_outreach_for_lead, stop_journey_steps
from app.services.journey_service import build_journey_for_service, get_template
from app.services.enrollment_helpers import reinstantiate_care_journey

TEST_DB = "tulip_test_journeys"
MONDAY = datetime(2026, 3, 2)   # a Monday, for predictable weekend math

_results = []


def check(name, cond):
    _results.append((name, bool(cond)))
    print(f"  {'PASS' if cond else 'FAIL'} {name}")


async def main():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client[TEST_DB]
    await client.drop_database(TEST_DB)

    # Point the app's get_database() + Beanie at the test DB.
    database_module.client = client
    database_module.db = db
    await init_beanie(database=db, document_models=[User, Lead, Enrollment, JourneyTemplate])

    # ---- seeding (AC13) ----
    await migrate_and_seed_journeys()
    care = await JourneyTemplate.find({"context": "care"}).count()
    outreach = await JourneyTemplate.find({"context": "outreach"}).count()
    check("seed: 3 care templates", care == 3)
    check("seed: 12 outreach templates (3 statuses x (3 svc + generic))", outreach == 12)

    # ---- AC1/AC2: outreach build, service-specific ----
    lead = Lead(lead_id="L-INT-1", name="Test One", phone_number="9000000001",
                status=LeadStatus.NOT_INTERESTED.value, service_requested="Antenatal")
    svc_journey = await build_outreach_for_lead(lead, MONDAY)
    types = [s["step_type"] for s in sorted(svc_journey, key=lambda x: x["order"])]
    check("outreach service: 3 steps", len(svc_journey) == 3)
    check("outreach service: Email,Email,WhatsApp", types == ["Email", "Email", "WhatsApp"])
    # 15-day cap: no two planned dates within 15 days; all weekdays
    dts = sorted(s["planned_date"].date() for s in svc_journey)
    gaps_ok = all((dts[i] - dts[i - 1]).days >= 15 for i in range(1, len(dts)))
    weekdays_ok = all(s["planned_date"].weekday() < 5 for s in svc_journey)
    check("outreach: 15-day cap respected (AC3)", gaps_ok)
    check("outreach: all weekdays (AC3)", weekdays_ok)

    # ---- AC2: generic outreach when service unknown ----
    lead_g = Lead(lead_id="L-INT-2", name="Test Two", phone_number="9000000002",
                  status=LeadStatus.LEAD_CLOSED_NO_RESPONSE.value, service_requested="Mystery")
    gen_journey = await build_outreach_for_lead(lead_g, MONDAY)
    gtypes = [s["step_type"] for s in sorted(gen_journey, key=lambda x: x["order"])]
    has_optional = any(s.get("is_optional") for s in gen_journey)
    check("outreach generic: Email,WhatsApp,WhatsApp", gtypes == ["Email", "WhatsApp", "WhatsApp"])
    check("outreach generic: has optional final step", has_optional)

    # ---- AC11: Do-Not-Contact generates nothing ----
    lead.do_not_contact = True
    dnc_journey = await build_outreach_for_lead(lead, MONDAY)
    check("DNC: outreach build returns nothing (AC11)", dnc_journey == [])

    # ---- AC6: Antenatal care loop sized by trimester ----
    t1 = await build_journey_for_service("Antenatal", MONDAY, ctx={"trimester": "Trimester 1"})
    t3 = await build_journey_for_service("Antenatal", MONDAY, ctx={"trimester": "Trimester 3"})
    check("care Antenatal T1 longer than T3 (AC6)", len(t1) > len(t3))
    check("care Antenatal T1 has a loop (>3 steps)", len(t1) > 3)

    # ---- AC7: Antenatal blank trimester -> only non-recurring; then set -> loop ----
    enr = Enrollment(enrollment_id="ENR-INT-1", service_enrolled="Antenatal",
                     subscriber_name="Mom", phone_number="9000000003",
                     created_at=MONDAY)
    enr.journey = await build_journey_for_service("Antenatal", MONDAY, ctx=None)
    check("Antenatal blank trimester: only non-recurring step(s) (AC7)", len(enr.journey) == 1)
    # mark the welcome step done, then set trimester and re-instantiate
    enr.journey[0]["status"] = "done"
    enr.journey[0]["completed_by_name"] = "Agent X"
    enr.trimester = "Trimester 2"
    rebuilt = await reinstantiate_care_journey(enr)
    welcome = next((s for s in rebuilt if s["step_id"] == "an_welcome"), None)
    check("re-instantiate builds the loop on trimester set (AC7)", len(rebuilt) > 1)
    check("re-instantiate preserves completed welcome (attribution)",
          welcome is not None and welcome["status"] == "done" and welcome["completed_by_name"] == "Agent X")

    # ---- AC10: stop keeps history, drops pending ----
    stopped = stop_journey_steps(rebuilt)
    check("stop: keeps done, drops pending (AC10)",
          all(s["status"] in ("done", "skipped") for s in stopped) and len(stopped) < len(rebuilt))

    # ---- AC9: PreConception keep-in-touch loop ~12 ----
    pc = await build_journey_for_service("PreConception", MONDAY)
    loop_steps = [s for s in pc if s.get("template_step_id") == "pc_keepintouch"]
    check("PreConception keep-in-touch ~12 occurrences (AC9)", len(loop_steps) == 12)

    # ---- Duplicate/empty-template resilience (the instantiate-empty bug) ----
    coll = db.journey_templates
    try:
        await coll.drop_index("context_trigger_unique")
    except Exception:
        pass
    # Inject an EMPTY duplicate Antenatal care template (simulates the bad record).
    await coll.insert_one({
        "context": "care", "trigger_key": "Antenatal", "steps": [],
        "updated_at": datetime.utcnow(), "updated_by_name": "bad-empty-dup",
    })
    dup_count = await JourneyTemplate.find({"context": "care", "trigger_key": "Antenatal"}).count()
    check("setup: 2 Antenatal care templates (one empty)", dup_count == 2)
    best = await get_template("care", "Antenatal")
    check("get_template returns the NON-empty one on duplicates (fix)",
          best is not None and len(best.steps or []) > 0)
    # End-to-end: with the empty duplicate STILL present (pre-dedup state, exactly
    # what the user hit), the instantiate code path must still build a full journey.
    enr_inst = Enrollment(enrollment_id="ENR-INST-1", service_enrolled="Antenatal",
                          subscriber_name="Mom2", phone_number="9000000009",
                          trimester="Trimester 1", created_at=MONDAY)
    enr_inst.journey = await reinstantiate_care_journey(enr_inst)
    check("instantiate builds non-empty even with empty duplicate present (bug fixed)",
          len(enr_inst.journey) > 3)
    # Regression: the API response_model must NOT strip the journey (the bug where
    # GET returned 0 steps to the agent despite the DB having them).
    from app.routers.enrollments import enrollment_to_response
    from app.schemas.enrollment import EnrollmentResponse
    resp = EnrollmentResponse(**enrollment_to_response(enr_inst)).model_dump()
    check("EnrollmentResponse keeps journey (response_model not stripping)",
          len(resp.get("journey") or []) == len(enr_inst.journey))
    # Re-run startup task -> dedups + recreates the unique index.
    await migrate_and_seed_journeys()
    after = await JourneyTemplate.find({"context": "care", "trigger_key": "Antenatal"}).count()
    survivor = await get_template("care", "Antenatal")
    check("dedup leaves exactly 1 Antenatal care template", after == 1)
    check("dedup keeps the non-empty survivor", survivor is not None and len(survivor.steps or []) > 0)

    # ---- _ensure_template fills an existing-but-empty template ----
    await coll.delete_many({"context": "care", "trigger_key": "MaternityWellness"})
    await coll.insert_one({
        "context": "care", "trigger_key": "MaternityWellness", "steps": [],
        "updated_at": datetime.utcnow(), "updated_by_name": "empty",
    })
    await migrate_and_seed_journeys()
    mw = await get_template("care", "MaternityWellness")
    check("seed fills an existing-but-empty template (fix)",
          mw is not None and len(mw.steps or []) > 0)

    # cleanup
    await client.drop_database(TEST_DB)
    client.close()

    passed = sum(1 for _, ok in _results if ok)
    print(f"\n{passed}/{len(_results)} integration checks passed")
    if passed != len(_results):
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
