"""
DB-backed tests for "Add Service to an enrolled customer" and the
"Birthdays Today" reminder (against a throwaway local Mongo).

Run:

    cd backend && python -m tests.test_add_service

Safe: uses a dedicated test database that is dropped before and after.
"""
import asyncio
from datetime import datetime, date, timedelta

from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from fastapi import HTTPException

import app.database as database_module
from app.models.user import User
from app.models.lead import Lead
from app.models.enrollment import Enrollment
from app.models.enrollment_audit_log import EnrollmentAuditLog
from app.models.journey_template import JourneyTemplate

from app.services.journey_seed import migrate_and_seed_journeys
from app.schemas.enrollment import AddServiceRequest
from app.routers.enrollments import (
    add_service_to_enrollment,
    get_customer_services,
    get_birthdays_today,
    _birthday_matches,
    _is_leap_year,
)

TEST_DB = "tulip_test_add_service"

_results = []


def check(name, cond):
    _results.append((name, bool(cond)))
    print(f"  {'PASS' if cond else 'FAIL'} {name}")


def _admin(name="Admin One"):
    return {"user_id": "u-admin", "email": "admin@t.com", "full_name": name, "role": "admin"}


def _agent(uid, name):
    return {"user_id": uid, "email": f"{uid}@t.com", "full_name": name, "role": "agent"}


async def _make_source(**over):
    base = dict(
        enrollment_id=None,  # set by caller
        name="Jane Doe",
        subscriber_name="Jane Doe",
        phone_number="9876543210",
        email="jane@example.com",
        uhid="UH100",
        employee_id="EMP1",
        dob=date(1990, 5, 15),
        address="1 Street",
        linked_lead_id="LEAD_1",
        lead_source="Referral",
        service_enrolled="Antenatal",
        hclhc_spoc="Anjali Sharma",
    )
    base.update(over)
    e = Enrollment(**base)
    await e.insert()
    return e


async def main():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client[TEST_DB]
    await client.drop_database(TEST_DB)
    database_module.client = client
    database_module.db = db
    await init_beanie(
        database=db,
        document_models=[User, Lead, Enrollment, EnrollmentAuditLog, JourneyTemplate],
    )
    await migrate_and_seed_journeys()

    # ---------- Feature 1: Add Service ----------
    src = await _make_source(enrollment_id="ENR_TEST_001")
    check("source starts without a customer_group_id", src.customer_group_id is None)

    body = AddServiceRequest(
        billed_date=date.today(),
        package_billed="Premium",
        service_enrolled="PreConception",
        hclhc_spoc="Anjali Sharma",
    )
    resp = await add_service_to_enrollment("ENR_TEST_001", body, _admin())

    # New linked record created, distinct id
    check("add-service returns a new enrollment id", resp["enrollment_id"] != "ENR_TEST_001")
    new1 = await Enrollment.find_one(Enrollment.enrollment_id == resp["enrollment_id"])
    src = await Enrollment.find_one(Enrollment.enrollment_id == "ENR_TEST_001")

    # Shared customer_group_id == source's own id
    check("source backfilled its own customer_group_id",
          src.customer_group_id == "ENR_TEST_001")
    check("new service shares the customer_group_id",
          new1.customer_group_id == "ENR_TEST_001")

    # Identity fields copied from source
    check("identity copied (name/phone/uhid/dob/lead_source)",
          new1.name == src.name and new1.phone_number == src.phone_number
          and new1.uhid == src.uhid and new1.dob == src.dob
          and new1.lead_source == src.lead_source
          and new1.linked_lead_id == src.linked_lead_id)

    # Service fields from the request
    check("service fields set from request",
          new1.service_enrolled == "PreConception" and new1.package_billed == "Premium")

    # Journey instantiated for the NEW service
    check("care journey instantiated for the new service", len(new1.journey or []) > 0)

    # Audit entry written
    audits = await EnrollmentAuditLog.find(
        EnrollmentAuditLog.enrollment_id == new1.enrollment_id
    ).to_list()
    check("audit log written for the added service",
          any(c.get("field") == "service_added"
              for a in audits for c in (a.changes or [])))

    # Repeats of the SAME service allowed (no uniqueness restriction)
    body_repeat = AddServiceRequest(
        billed_date=date.today(), package_billed="Premium",
        service_enrolled="PreConception", hclhc_spoc="Anjali Sharma",
    )
    await add_service_to_enrollment("ENR_TEST_001", body_repeat, _admin())
    grp = await Enrollment.find(Enrollment.customer_group_id == "ENR_TEST_001").to_list()
    check("repeat of same service allowed (3 records in group)", len(grp) == 3)

    # get /services returns all linked, sorted by created_at
    services = await get_customer_services("ENR_TEST_001", _admin())
    check("get_customer_services returns the whole group", services["count"] == 3)
    ids_sorted = [s["enrollment_id"] for s in services["services"]]
    check("services sorted with source first", ids_sorted[0] == "ENR_TEST_001")

    # Mandatory-field validation -> 422
    for missing_field, kwargs in [
        ("billed_date", dict(package_billed="P", service_enrolled="Antenatal", hclhc_spoc="X")),
        ("package_billed", dict(billed_date=date.today(), service_enrolled="Antenatal", hclhc_spoc="X")),
        ("service_enrolled", dict(billed_date=date.today(), package_billed="P", hclhc_spoc="X")),
        ("hclhc_spoc", dict(billed_date=date.today(), package_billed="P", service_enrolled="Antenatal")),
    ]:
        raised = False
        try:
            await add_service_to_enrollment("ENR_TEST_001", AddServiceRequest(**kwargs), _admin())
        except HTTPException as exc:
            raised = (exc.status_code == 422)
        check(f"missing {missing_field} -> 422", raised)

    # Whitespace-only mandatory string is rejected too
    raised = False
    try:
        await add_service_to_enrollment(
            "ENR_TEST_001",
            AddServiceRequest(billed_date=date.today(), package_billed="   ",
                              service_enrolled="Antenatal", hclhc_spoc="X"),
            _admin(),
        )
    except HTTPException as exc:
        raised = (exc.status_code == 422)
    check("whitespace-only package_billed -> 422", raised)

    # 404 for unknown enrollment
    raised = False
    try:
        await add_service_to_enrollment("NOPE", body, _admin())
    except HTTPException as exc:
        raised = (exc.status_code == 404)
    check("unknown enrollment -> 404", raised)

    # ---------- Feature 3: Birthdays Today ----------
    # Pure Feb-29 rule
    check("leap-year helper (2024 leap, 2025 not)", _is_leap_year(2024) and not _is_leap_year(2025))
    check("Feb29 dob matches Feb28 in non-leap year",
          _birthday_matches(date(2000, 2, 29), date(2025, 2, 28)))
    check("Feb29 dob does NOT match Feb28 in a leap year",
          not _birthday_matches(date(2000, 2, 29), date(2024, 2, 28)))
    check("Feb29 dob matches Feb29 in a leap year",
          _birthday_matches(date(2000, 2, 29), date(2024, 2, 29)))
    check("non-birthday does not match", not _birthday_matches(date(1990, 6, 1), date(2025, 6, 2)))

    # Live endpoint: customer whose birthday is today (IST)
    today_ist = (datetime.utcnow() + timedelta(hours=5, minutes=30)).date()
    bday = date(1992, today_ist.month, today_ist.day)

    # Two services for the SAME customer (grouped) -> should dedupe to one
    g = await _make_source(enrollment_id="ENR_BD_001", name="Bday Person",
                           uhid="UHBD", phone_number="9800000000", dob=bday,
                           hclhc_spoc="Anjali Sharma", customer_group_id="ENR_BD_001")
    await _make_source(enrollment_id="ENR_BD_002", name="Bday Person",
                       uhid="UHBD", phone_number="9800000000", dob=bday,
                       service_enrolled="PreConception",
                       hclhc_spoc="Anjali Sharma", customer_group_id="ENR_BD_001")
    # A different customer with a non-matching birthday
    await _make_source(enrollment_id="ENR_BD_003", name="Other", uhid="UHX",
                       phone_number="9811111111",
                       dob=date(1988, ((today_ist.month % 12) + 1), 1),
                       hclhc_spoc="Anjali Sharma")

    admin_view = await get_birthdays_today(_admin())
    ids = [b["enrollment_id"] for b in admin_view["birthdays"]]
    check("admin sees today's birthday customer", "ENR_BD_001" in ids)
    check("grouped multi-service customer deduped to one entry",
          sum(1 for b in admin_view["birthdays"] if b["name"] == "Bday Person") == 1)
    check("non-birthday customer excluded", "ENR_BD_003" not in ids)

    # Agent scoping: only their own SPOC customers
    agent_match = await get_birthdays_today(_agent("a1", "Anjali Sharma"))
    check("agent (SPOC) sees their birthday customer",
          any(b["name"] == "Bday Person" for b in agent_match["birthdays"]))
    agent_other = await get_birthdays_today(_agent("a2", "Rahul Verma"))
    check("other agent sees none (not their SPOC)", agent_other["count"] == 0)

    await client.drop_database(TEST_DB)
    client.close()

    passed = sum(1 for _, ok in _results if ok)
    total = len(_results)
    print(f"\n{passed}/{total} add-service/birthday checks passed")
    if passed != total:
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
