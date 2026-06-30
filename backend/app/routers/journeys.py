"""
Journey Templates API (Care + Outreach).

Super admins define journey templates keyed by (context, trigger_key). Everyone
authenticated can read; only super admins can edit. Editing affects FUTURE
journeys only.

Backward compatible: the original per-service care endpoints (GET "", GET/PUT
"/{service}") still work and operate on context="care".
"""
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel

from app.models.journey_template import (
    JourneyTemplate,
    JourneyStepDef,
    JourneyContext,
    StepType,
    CARE_SERVICES,
    make_outreach_key,
)
from app.services.journey_seed import OUTREACH_STATUSES
from app.middleware.auth_middleware import get_current_user, get_current_super_admin

router = APIRouter()

ALLOWED_SERVICES = CARE_SERVICES  # backward-compat alias


class StepInput(BaseModel):
    step_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    step_type: str = StepType.OTHER.value
    offset_days: int = 0
    order: int = 0
    recurrence_days: Optional[int] = None
    recurrence_count: Optional[int] = None
    horizon: Optional[str] = None
    is_optional: bool = False


class TemplateUpdateRequest(BaseModel):
    steps: List[StepInput]


class GeneralTemplateUpdateRequest(BaseModel):
    context: str
    trigger_key: str
    steps: List[StepInput]


def _step_to_dict(s: JourneyStepDef) -> dict:
    return s.model_dump()


def _template_to_response(template: JourneyTemplate) -> dict:
    return {
        "context": template.context,
        "trigger_key": template.trigger_key,
        # `service` alias kept so the existing care config UI keeps working.
        "service": template.trigger_key if template.context == JourneyContext.CARE.value else None,
        "steps": [_step_to_dict(s) for s in template.steps],
        "updated_at": template.updated_at,
        "updated_by_name": template.updated_by_name,
    }


def _empty_response(context: str, trigger_key: str) -> dict:
    return {
        "context": context,
        "trigger_key": trigger_key,
        "service": trigger_key if context == JourneyContext.CARE.value else None,
        "steps": [],
        "updated_at": None,
        "updated_by_name": None,
    }


def _build_steps(step_inputs: List[StepInput]) -> List[JourneyStepDef]:
    steps: List[JourneyStepDef] = []
    for idx, s in enumerate(step_inputs):
        steps.append(JourneyStepDef(
            step_id=s.step_id or uuid.uuid4().hex[:12],
            name=s.name.strip(),
            description=(s.description.strip() if s.description else None),
            step_type=s.step_type or StepType.OTHER.value,
            offset_days=int(s.offset_days or 0),
            order=s.order if s.order is not None else idx,
            recurrence_days=s.recurrence_days,
            recurrence_count=s.recurrence_count,
            horizon=s.horizon,
            is_optional=bool(s.is_optional),
        ))
    return steps


async def _upsert(context: str, trigger_key: str, step_inputs: List[StepInput], current_user: dict) -> dict:
    steps = _build_steps(step_inputs)
    template = await JourneyTemplate.find_one(
        {"context": context, "trigger_key": trigger_key}
    )
    if template:
        template.steps = steps
        template.updated_at = datetime.utcnow()
        template.updated_by = current_user["user_id"]
        template.updated_by_name = current_user.get("full_name", current_user["email"])
        await template.save()
    else:
        template = JourneyTemplate(
            context=context,
            trigger_key=trigger_key,
            steps=steps,
            updated_by=current_user["user_id"],
            updated_by_name=current_user.get("full_name", current_user["email"]),
        )
        await template.insert()
    return _template_to_response(template)


# --------------------------------------------------------------------------- #
# Generalized endpoints (literal paths — declared BEFORE "/{service}")
# --------------------------------------------------------------------------- #
@router.get("/catalogue")
async def get_catalogue(current_user: dict = Depends(get_current_user)):
    """Enumerate every (context, trigger_key) the config UI can edit."""
    care = [{"context": "care", "trigger_key": s, "label": s} for s in CARE_SERVICES]
    outreach = []
    for st in OUTREACH_STATUSES:
        for svc in CARE_SERVICES:
            key = make_outreach_key(st, svc)
            outreach.append({"context": "outreach", "trigger_key": key, "label": f"{st} · {svc}"})
        gkey = make_outreach_key(st, None)
        outreach.append({"context": "outreach", "trigger_key": gkey, "label": f"{st} · Generic"})
    return {"care": care, "outreach": outreach, "statuses": OUTREACH_STATUSES, "services": CARE_SERVICES}


@router.get("/list")
async def list_by_context(
    context: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """List all templates for a context ('care' or 'outreach')."""
    templates = await JourneyTemplate.find({"context": context}).to_list()
    return {"templates": [_template_to_response(t) for t in templates]}


@router.get("/one")
async def get_one(
    context: str = Query(...),
    trigger_key: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    template = await JourneyTemplate.find_one({"context": context, "trigger_key": trigger_key})
    return _template_to_response(template) if template else _empty_response(context, trigger_key)


@router.put("/upsert")
async def upsert_general(
    body: GeneralTemplateUpdateRequest,
    current_user: dict = Depends(get_current_super_admin),
):
    if body.context not in (JourneyContext.CARE.value, JourneyContext.OUTREACH.value):
        raise HTTPException(status_code=400, detail="context must be 'care' or 'outreach'")
    if not body.trigger_key or not body.trigger_key.strip():
        raise HTTPException(status_code=400, detail="trigger_key is required")
    return await _upsert(body.context, body.trigger_key.strip(), body.steps, current_user)


# --------------------------------------------------------------------------- #
# Backward-compatible CARE endpoints
# --------------------------------------------------------------------------- #
@router.get("")
async def list_templates(current_user: dict = Depends(get_current_user)):
    """Care templates for every service (backward-compatible shape)."""
    existing = await JourneyTemplate.find({"context": JourneyContext.CARE.value}).to_list()
    by_key = {t.trigger_key.lower(): t for t in existing}
    out = []
    for svc in CARE_SERVICES:
        t = by_key.get(svc.lower())
        out.append(_template_to_response(t) if t else _empty_response(JourneyContext.CARE.value, svc))
    return {"templates": out, "services": CARE_SERVICES}


@router.get("/{service}")
async def get_template(service: str, current_user: dict = Depends(get_current_user)):
    template = await JourneyTemplate.find_one(
        {"context": JourneyContext.CARE.value, "trigger_key": service}
    )
    return _template_to_response(template) if template else _empty_response(JourneyContext.CARE.value, service)


@router.put("/{service}")
async def upsert_template(
    service: str,
    body: TemplateUpdateRequest,
    current_user: dict = Depends(get_current_super_admin),
):
    match = next((s for s in CARE_SERVICES if s.lower() == service.strip().lower()), None)
    if not match:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Service must be one of: {', '.join(CARE_SERVICES)}",
        )
    return await _upsert(JourneyContext.CARE.value, match, body.steps, current_user)
