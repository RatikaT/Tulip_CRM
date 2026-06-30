"""
Helper to create an Enrollment from a Lead.

Used wherever a lead becomes "Enrolled" — the lead-update endpoint, bulk upload,
and a one-time backfill — so an enrollment is ALWAYS created (not only when an
agent goes through the Confirm Enrollment modal).
"""
import logging
from typing import Optional

from app.models.lead import Lead
from app.models.enrollment import (
    Enrollment,
    ConnectStatus as EnrollmentConnectStatus,
    Trimester as EnrollmentTrimester,
)
from app.utils.enrollment_id import generate_enrollment_id
from app.database import get_database
from app.services.journey_service import build_journey_for_service

logger = logging.getLogger(__name__)


async def create_enrollment_from_lead(
    lead: Lead,
    created_by_id: str,
    created_by_name: str,
    skip_if_exists: bool = True,
) -> Optional[Enrollment]:
    """
    Create an Enrollment mirroring the lead's values. Returns the new enrollment,
    or None if one already exists for this lead (when skip_if_exists=True).
    """
    if skip_if_exists:
        existing = await Enrollment.find_one(
            Enrollment.linked_lead_id == lead.lead_id,
            Enrollment.is_deleted == False,
        )
        if existing:
            return None

    db = get_database()
    enrollment_id = await generate_enrollment_id(db)

    # The enrollment should stay with the agent who handled the lead, NOT whoever
    # happened to click "Enroll" (e.g. a super admin enrolling on the agent's behalf).
    owner_id = lead.assigned_to or created_by_id
    owner_name = lead.assigned_to_name or created_by_name

    # SPOC carries from the lead; if the lead never had one, default it to the
    # lead's agent so the SPOC and owner are the same person (not two strangers).
    spoc = lead.hclhc_spoc or lead.assigned_to_name

    trimester_value = None
    if lead.trimester:
        try:
            trimester_value = EnrollmentTrimester(lead.trimester)
        except ValueError:
            trimester_value = None

    enrollment = Enrollment(
        enrollment_id=enrollment_id,
        linked_lead_id=lead.lead_id,
        subscriber_name=lead.name,
        employee_id=lead.employee_id or "",
        phone_number=lead.phone_number,
        email=lead.email,
        uhid=lead.uhid,
        trimester=trimester_value,
        doctor_name=lead.doctor_name,
        service_enrolled=lead.service_requested,          # standardized: service flows lead -> enrollment
        package_name_enrolled=lead.package_requested,
        service_partner=lead.service_partner or None,
        partner_centre_selected=lead.provider_location,
        hclhc_spoc=spoc,
        connect_status=EnrollmentConnectStatus.CONNECTED,
        created_by=created_by_id,            # audit: who performed the enrollment
        created_by_name=created_by_name,
        assigned_to=owner_id,                # ownership: the lead's agent
        assigned_to_name=owner_name,
    )

    # Snapshot the service's care-journey template onto this enrollment.
    # Pass trimester so an Antenatal loop materializes immediately when set; with a
    # blank / "Not Conceived" trimester the engine builds only the non-recurring
    # steps (the loop is generated later when the agent sets a real trimester).
    trimester_ctx = lead.trimester if lead.trimester else None
    enrollment.journey = await build_journey_for_service(
        enrollment.service_enrolled,
        enrollment.created_at,
        ctx={"trimester": trimester_ctx} if trimester_ctx else None,
        do_not_contact=bool(getattr(lead, "do_not_contact", False)),
    )

    await enrollment.insert()
    logger.info(f"Created enrollment {enrollment_id} for lead {lead.lead_id}")
    return enrollment
