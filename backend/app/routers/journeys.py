"""
Care Journey Templates API.

Super admins define a per-service follow-up journey (ordered steps). Everyone
authenticated can read them (the enrollment UI needs the step catalogue); only
super admins can edit. Editing a template affects FUTURE enrollments only.
"""
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.models.journey_template import JourneyTemplate, JourneyStepDef, StepType
from app.middleware.auth_middleware import get_current_user, get_current_super_admin

router = APIRouter()

# The 3 standardized services (must match SERVICE_*_OPTIONS on the frontend)
ALLOWED_SERVICES = ["Antenatal", "PreConception", "MaternityWellness"]


class StepInput(BaseModel):
    step_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    step_type: str = StepType.OTHER.value
    offset_days: int = 0
    order: int = 0


class TemplateUpdateRequest(BaseModel):
    steps: List[StepInput]


def _template_to_response(template: JourneyTemplate) -> dict:
    return {
        "service": template.service,
        "steps": [s.model_dump() for s in template.steps],
        "updated_at": template.updated_at,
        "updated_by_name": template.updated_by_name,
    }


def _empty_response(service: str) -> dict:
    return {"service": service, "steps": [], "updated_at": None, "updated_by_name": None}


@router.get("")
async def list_templates(current_user: dict = Depends(get_current_user)):
    """Return the template for every allowed service (empty if not yet defined)."""
    existing = await JourneyTemplate.find_all().to_list()
    by_service = {t.service.lower(): t for t in existing}
    out = []
    for svc in ALLOWED_SERVICES:
        t = by_service.get(svc.lower())
        out.append(_template_to_response(t) if t else _empty_response(svc))
    return {"templates": out, "services": ALLOWED_SERVICES}


@router.get("/{service}")
async def get_template(service: str, current_user: dict = Depends(get_current_user)):
    template = await JourneyTemplate.find_one(
        {"service": {"$regex": f"^{service}$", "$options": "i"}}
    )
    if not template:
        return _empty_response(service)
    return _template_to_response(template)


@router.put("/{service}")
async def upsert_template(
    service: str,
    body: TemplateUpdateRequest,
    current_user: dict = Depends(get_current_super_admin),
):
    """Create or replace the steps of a service's journey template (super admin)."""
    # Validate against the standardized service list (case-insensitive)
    match = next((s for s in ALLOWED_SERVICES if s.lower() == service.strip().lower()), None)
    if not match:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Service must be one of: {', '.join(ALLOWED_SERVICES)}",
        )

    # Build step defs, generating a stable step_id where missing
    steps: List[JourneyStepDef] = []
    for idx, s in enumerate(body.steps):
        steps.append(JourneyStepDef(
            step_id=s.step_id or uuid.uuid4().hex[:12],
            name=s.name.strip(),
            description=(s.description.strip() if s.description else None),
            step_type=s.step_type or StepType.OTHER.value,
            offset_days=int(s.offset_days or 0),
            order=s.order if s.order is not None else idx,
        ))

    template = await JourneyTemplate.find_one(
        {"service": {"$regex": f"^{match}$", "$options": "i"}}
    )
    if template:
        template.steps = steps
        template.updated_at = datetime.utcnow()
        template.updated_by = current_user["user_id"]
        template.updated_by_name = current_user.get("full_name", current_user["email"])
        await template.save()
    else:
        template = JourneyTemplate(
            service=match,
            steps=steps,
            updated_by=current_user["user_id"],
            updated_by_name=current_user.get("full_name", current_user["email"]),
        )
        await template.insert()

    return _template_to_response(template)
