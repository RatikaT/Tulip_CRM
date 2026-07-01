"""
Field Configuration API.

Super admins configure a curated set of Lead/Enrollment fields (required,
text-vs-dropdown, options). Everyone authenticated can read the effective config
(the forms consume it). Additive to the hardcoded mandatory rules.
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel

from app.models.field_config import FieldConfig, CURATED_FIELDS, FormKind, InputType
from app.middleware.auth_middleware import get_current_user, get_current_super_admin

router = APIRouter()


class FieldConfigUpdate(BaseModel):
    form: str
    field_name: str
    label: Optional[str] = None
    input_type: str = InputType.TEXT.value
    required: bool = False
    options: List[str] = []


def _to_dict(fc: FieldConfig) -> dict:
    return {
        "form": fc.form, "field_name": fc.field_name, "label": fc.label,
        "input_type": fc.input_type, "required": fc.required,
        "options": fc.options or [], "order": fc.order,
        "updated_by_name": fc.updated_by_name,
    }


async def _effective_for_form(form: str) -> List[dict]:
    """Merge stored configs over the curated defaults so every curated field appears."""
    curated = CURATED_FIELDS.get(form, [])
    stored = {fc.field_name: fc for fc in await FieldConfig.find({"form": form}).to_list()}
    out = []
    for idx, item in enumerate(curated):
        fc = stored.get(item.field_name)
        if fc:
            d = _to_dict(fc)
            d["order"] = idx
            out.append(d)
        else:
            out.append({
                "form": form, "field_name": item.field_name, "label": item.label,
                "input_type": item.input_type, "required": False,
                "options": item.options or [], "order": idx, "updated_by_name": None,
            })
    return out


@router.get("")
async def list_field_configs(
    form: str = Query(..., description="lead | enrollment"),
    current_user: dict = Depends(get_current_user),
):
    """Effective config for a form's curated fields (defaults merged with edits)."""
    if form not in (FormKind.LEAD.value, FormKind.ENROLLMENT.value):
        raise HTTPException(status_code=400, detail="form must be 'lead' or 'enrollment'")
    return {"form": form, "fields": await _effective_for_form(form)}


@router.get("/all")
async def all_field_configs(current_user: dict = Depends(get_current_user)):
    """Effective config for both forms (used by the config UI)."""
    return {
        "lead": await _effective_for_form("lead"),
        "enrollment": await _effective_for_form("enrollment"),
    }


@router.put("")
async def upsert_field_config(
    body: FieldConfigUpdate,
    current_user: dict = Depends(get_current_super_admin),
):
    """Create/update a curated field's config (super admin)."""
    if body.form not in (FormKind.LEAD.value, FormKind.ENROLLMENT.value):
        raise HTTPException(status_code=400, detail="form must be 'lead' or 'enrollment'")
    curated = {f.field_name: f for f in CURATED_FIELDS.get(body.form, [])}
    if body.field_name not in curated:
        raise HTTPException(status_code=400, detail=f"{body.field_name} is not a configurable field")
    if body.input_type not in (InputType.TEXT.value, InputType.DROPDOWN.value):
        raise HTTPException(status_code=400, detail="input_type must be 'text' or 'dropdown'")

    label = body.label or curated[body.field_name].label
    options = [o.strip() for o in (body.options or []) if o and o.strip()]
    fc = await FieldConfig.find_one({"form": body.form, "field_name": body.field_name})
    if fc:
        fc.label = label
        fc.input_type = body.input_type
        fc.required = bool(body.required)
        fc.options = options
        fc.updated_at = datetime.utcnow()
        fc.updated_by = current_user["user_id"]
        fc.updated_by_name = current_user.get("full_name", current_user["email"])
        await fc.save()
    else:
        fc = FieldConfig(
            form=body.form, field_name=body.field_name, label=label,
            input_type=body.input_type, required=bool(body.required), options=options,
            updated_by=current_user["user_id"],
            updated_by_name=current_user.get("full_name", current_user["email"]),
        )
        await fc.insert()
    return _to_dict(fc)
