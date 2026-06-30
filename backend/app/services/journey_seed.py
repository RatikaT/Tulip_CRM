"""
Journey-template migration + default seeding.

Runs once at startup (idempotent):
  1. Drop the legacy unique index on `service` (replaced by the composite
     (context, trigger_key) unique index).
  2. Migrate existing care templates: {service: X} -> {context: "care",
     trigger_key: X}.
  3. Seed default Care and Outreach templates for combinations that don't exist
     yet (never overwrites an existing template, so admin edits are preserved).
"""
import logging
import uuid
from datetime import datetime
from typing import List, Dict, Any

from app.database import get_database
from app.models.journey_template import (
    JourneyTemplate,
    JourneyContext,
    JourneyStepDef,
    StepType,
    CARE_SERVICES,
    GENERIC_SERVICE,
    make_outreach_key,
)

logger = logging.getLogger(__name__)

# Lead statuses that trigger a central outreach journey when an agent closes a lead.
OUTREACH_STATUSES = [
    "Not Interested",
    "Lead Closed-No Response",
    "Follow up-No Response",
]


def _step(name, step_type, offset_days, order, **kw) -> JourneyStepDef:
    return JourneyStepDef(
        step_id=kw.get("step_id") or uuid.uuid4().hex[:8],
        name=name,
        description=kw.get("description"),
        step_type=step_type,
        offset_days=offset_days,
        order=order,
        recurrence_days=kw.get("recurrence_days"),
        recurrence_count=kw.get("recurrence_count"),
        horizon=kw.get("horizon"),
        is_optional=kw.get("is_optional", False),
    )


def _care_templates() -> Dict[str, List[JourneyStepDef]]:
    """Default care journeys keyed by service."""
    return {
        "PreConception": [
            _step("Welcome mailer", StepType.EMAIL.value, 0, 0, step_id="pc_welcome"),
            _step("Lab booking — call for preferred date", StepType.CALL.value, 3, 1, step_id="pc_lab"),
            _step("Doctor consultation", StepType.APPOINTMENT.value, 7, 2, step_id="pc_doc"),
            _step("Counselling session", StepType.APPOINTMENT.value, 14, 3, step_id="pc_counsel"),
            _step("Dietician session", StepType.APPOINTMENT.value, 14, 4, step_id="pc_diet"),
            _step("Keep-in-touch call", StepType.CALL.value, 30, 5,
                  step_id="pc_keepintouch", recurrence_days=30, recurrence_count=12,
                  description="Monthly check-in to catch conception and convert to Antenatal."),
        ],
        "Antenatal": [
            _step("Welcome mailer", StepType.EMAIL.value, 0, 0, step_id="an_welcome"),
            _step("Service call", StepType.CALL.value, 30, 1,
                  step_id="an_call", recurrence_days=30, horizon="trimester",
                  description="Monthly service call until delivery."),
            _step("WhatsApp check-in", StepType.WHATSAPP.value, 15, 2,
                  step_id="an_wa", recurrence_days=15, horizon="trimester",
                  description="Fortnightly WhatsApp check-in until delivery."),
        ],
        "MaternityWellness": [
            _step("Welcome mailer", StepType.EMAIL.value, 0, 0, step_id="mw_welcome"),
            _step("Wellness onboarding call", StepType.CALL.value, 7, 1, step_id="mw_call"),
            _step("Wellness check-in", StepType.WHATSAPP.value, 30, 2,
                  step_id="mw_checkin", recurrence_days=30, recurrence_count=6,
                  description="Monthly wellness check-in."),
        ],
    }


def _outreach_service_steps() -> List[JourneyStepDef]:
    # Service-specific: Mail @15 -> Mail @30 -> WhatsApp @30 (final)
    return [
        _step("Re-engagement mailer", StepType.EMAIL.value, 15, 0, step_id="os_mail1"),
        _step("Follow-up mailer", StepType.EMAIL.value, 30, 1, step_id="os_mail2"),
        _step("WhatsApp nudge (final)", StepType.WHATSAPP.value, 30, 2, step_id="os_wa"),
    ]


def _outreach_generic_steps() -> List[JourneyStepDef]:
    # Generic (unknown service): Mail @15 -> WhatsApp @30 -> OPTIONAL WhatsApp @45
    return [
        _step("Re-engagement mailer — all Tulip programs", StepType.EMAIL.value, 15, 0, step_id="og_mail"),
        _step("WhatsApp nudge — all Tulip programs", StepType.WHATSAPP.value, 30, 1, step_id="og_wa1"),
        _step("WhatsApp nudge (optional) — all Tulip programs", StepType.WHATSAPP.value, 45, 2,
              step_id="og_wa2", is_optional=True),
    ]


async def _ensure_template(context: str, trigger_key: str, steps: List[JourneyStepDef]):
    """
    Seed a default template. Creates it when missing, OR fills it when it exists
    but has zero steps (so an accidentally-empty record gets the defaults).
    Never overwrites a template that already has steps (preserves admin edits).
    Returns True when it created or filled one.
    """
    existing = await JourneyTemplate.find_one(
        {"context": context, "trigger_key": trigger_key}
    )
    if existing:
        if not (existing.steps or []):
            existing.steps = steps
            existing.updated_by_name = "system (seed)"
            existing.updated_at = datetime.utcnow()
            await existing.save()
            return True
        return False
    await JourneyTemplate(
        context=context,
        trigger_key=trigger_key,
        steps=steps,
        updated_by_name="system (seed)",
    ).insert()
    return True


async def migrate_and_seed_journeys():
    """Idempotent startup task: migrate legacy templates and seed defaults."""
    db = get_database()
    coll = db.journey_templates

    # 1. Drop the legacy unique index on `service` if it still exists.
    try:
        idx_names = [ix["name"] for ix in await coll.list_indexes().to_list(length=100)]
        if "service_1" in idx_names:
            await coll.drop_index("service_1")
            logger.info("journey migration: dropped legacy index service_1")
    except Exception as e:
        logger.warning(f"journey migration: could not inspect/drop service_1 index: {e}")

    # 2. Migrate legacy care templates {service: X} -> {context, trigger_key}.
    try:
        migrated = 0
        async for doc in coll.find({"context": {"$exists": False}, "service": {"$exists": True}}):
            await coll.update_one(
                {"_id": doc["_id"]},
                {
                    "$set": {"context": JourneyContext.CARE.value, "trigger_key": doc.get("service")},
                    "$unset": {"service": ""},
                },
            )
            migrated += 1
        if migrated:
            logger.info(f"journey migration: moved {migrated} legacy care template(s) to context/trigger_key")
    except Exception as e:
        logger.warning(f"journey migration: template key migration failed: {e}")

    # 2a. Deduplicate (context, trigger_key): keep the richest record (most steps,
    # newest as tie-break), delete the rest. Prevents an empty duplicate from
    # winning the lookup AND lets the unique index below succeed.
    try:
        from collections import defaultdict
        from datetime import datetime as _dt
        groups = defaultdict(list)
        async for doc in coll.find({}):
            groups[(doc.get("context"), doc.get("trigger_key"))].append(doc)
        removed = 0
        for _key, docs in groups.items():
            if len(docs) <= 1:
                continue
            docs.sort(key=lambda d: (len(d.get("steps") or []), d.get("updated_at") or _dt.min), reverse=True)
            for extra in docs[1:]:
                await coll.delete_one({"_id": extra["_id"]})
                removed += 1
        if removed:
            logger.info(f"journey dedup: removed {removed} duplicate template(s)")
    except Exception as e:
        logger.warning(f"journey dedup failed: {e}")

    # 2b. Create the composite unique index NOW (after legacy docs have keys, so
    # we don't hit duplicate (null, null)). Idempotent.
    try:
        await coll.create_index(
            [("context", 1), ("trigger_key", 1)],
            unique=True,
            name="context_trigger_unique",
        )
    except Exception as e:
        logger.warning(f"journey migration: could not create composite unique index: {e}")

    # 3. Seed defaults (only those missing).
    seeded = 0
    for service, steps in _care_templates().items():
        if await _ensure_template(JourneyContext.CARE.value, service, steps):
            seeded += 1

    for status in OUTREACH_STATUSES:
        for service in CARE_SERVICES:
            key = make_outreach_key(status, service)
            if await _ensure_template(JourneyContext.OUTREACH.value, key, _outreach_service_steps()):
                seeded += 1
        generic_key = make_outreach_key(status, None)  # "<status>::GENERIC"
        if await _ensure_template(JourneyContext.OUTREACH.value, generic_key, _outreach_generic_steps()):
            seeded += 1

    if seeded:
        logger.info(f"journey seed: created/filled {seeded} default template(s)")
    return {"seeded": seeded}
