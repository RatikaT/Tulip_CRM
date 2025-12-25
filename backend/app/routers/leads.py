"""
Lead Management Routes
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query, UploadFile, File
from typing import Optional, List
from datetime import datetime, date
import csv
import io
from app.schemas.lead import (
    LeadCreateRequest,
    LeadUpdateRequest,
    LeadResponse,
    LeadListResponse,
    CommentCreateRequest
)
from app.models.lead import Lead, LeadStatus, LeadSource, Stage, LookingFor, ServiceEnrolled
from app.models.audit_log import AuditLog, AuditAction
from app.models.user import User
from app.middleware.auth_middleware import get_current_user, get_current_admin
from app.utils.lead_id import generate_lead_id
from app.database import get_database
import logging
import math

logger = logging.getLogger(__name__)

router = APIRouter()


def lead_to_response(lead: Lead) -> dict:
    """Convert Lead document to response dict"""
    return {
        "id": str(lead.id),
        "lead_id": lead.lead_id,

        # Timestamps
        "created_at": lead.created_at,
        "updated_at": lead.updated_at,

        # Lead Source and Status
        "lead_source": lead.lead_source.value if lead.lead_source else None,
        "lead_creation_date": lead.lead_creation_date,
        "status": lead.status.value if lead.status else None,

        # User Details
        "name": lead.name,
        "email": lead.email,
        "phone_number": lead.phone_number,
        "employee_id": lead.employee_id,
        "uhid": lead.uhid,

        # Location Details
        "user_facility": lead.user_facility,
        "city": lead.city,
        "pin_code": lead.pin_code,
        "address": lead.address,

        # Lead Information
        "stage": lead.stage.value if lead.stage else None,
        "looking_for": lead.looking_for.value if lead.looking_for else None,
        "package_requested": lead.package_requested,

        # Service Details
        "service_enrolled": lead.service_enrolled.value if lead.service_enrolled else None,
        "package_name_enrolled": lead.package_name_enrolled,
        "provider_name": lead.provider_name,
        "provider_location": lead.provider_location,
        "hclhc_spoc": lead.hclhc_spoc,

        # Doctor/Consultation Details
        "doctor_name": lead.doctor_name,
        "consult_date": lead.consult_date,

        # Call Tracking
        "number_of_calls": lead.number_of_calls,
        "calls": lead.calls,
        "follow_up_date": lead.follow_up_date,

        # Assignment
        "assigned_to": lead.assigned_to,
        "assigned_to_name": lead.assigned_to_name,

        # Comments
        "comments": lead.comments,

        # System
        "created_by": lead.created_by
    }


@router.post("/bulk-upload")
async def bulk_upload_leads(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_admin)
):
    """
    Bulk upload leads from CSV file (Admin only)
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV files are supported"
        )

    db = get_database()
    errors = []
    created_count = 0
    total_rows = 0

    try:
        # Read file content
        contents = await file.read()
        decoded = contents.decode('utf-8-sig')  # Handle BOM
        reader = csv.DictReader(io.StringIO(decoded))

        for row_num, row in enumerate(reader, start=2):  # Start at 2 (row 1 is header)
            total_rows += 1
            try:
                # Required fields validation
                name = row.get('name', '').strip()
                phone = row.get('phone_number', '').strip()

                if not name:
                    errors.append({"row": row_num, "error": "Name is required"})
                    continue
                if not phone or len(phone) != 10 or not phone.isdigit():
                    errors.append({"row": row_num, "error": f"Invalid phone number: {phone}"})
                    continue

                # Check for duplicate phone
                existing = await Lead.find_one(Lead.phone_number == phone, Lead.is_deleted == False)
                if existing:
                    errors.append({"row": row_num, "error": f"Phone {phone} already exists"})
                    continue

                # Parse lead source
                lead_source_str = row.get('lead_source', '').strip()
                lead_source = None
                if lead_source_str:
                    source_map = {
                        'mail': LeadSource.MAIL,
                        'website': LeadSource.WEBSITE,
                        'wa': LeadSource.WA,
                        'whatsapp': LeadSource.WA,
                        'call': LeadSource.CALL,
                        'sms': LeadSource.SMS,
                        'emr': LeadSource.EMR,
                        'other': LeadSource.OTHER
                    }
                    lead_source = source_map.get(lead_source_str.lower(), LeadSource.OTHER)
                else:
                    lead_source = LeadSource.OTHER

                # Parse status
                status_str = row.get('status', '').strip()
                lead_status = LeadStatus.NEW
                if status_str:
                    status_map = {
                        'new': LeadStatus.NEW,
                        'not interested': LeadStatus.NOT_INTERESTED,
                        'interested': LeadStatus.INTERESTED,
                        'lead closed - no response': LeadStatus.LEAD_CLOSED_NO_RESPONSE,
                        'no response': LeadStatus.NO_RESPONSE,
                        'followup required': LeadStatus.FOLLOWUP_REQUIRED,
                        'follow up required': LeadStatus.FOLLOWUP_REQUIRED,
                    }
                    lead_status = status_map.get(status_str.lower(), LeadStatus.NEW)

                # Parse stage
                stage_str = row.get('stage', '').strip()
                stage = None
                if stage_str:
                    stage_map = {
                        'pregnant - 1st': Stage.PREGNANT_1ST,
                        '1st': Stage.PREGNANT_1ST,
                        '1st trimester': Stage.PREGNANT_1ST,
                        'pregnant - 2nd': Stage.PREGNANT_2ND,
                        '2nd': Stage.PREGNANT_2ND,
                        '2nd trimester': Stage.PREGNANT_2ND,
                        'pregnant - 3rd': Stage.PREGNANT_3RD,
                        '3rd': Stage.PREGNANT_3RD,
                        '3rd trimester': Stage.PREGNANT_3RD,
                        'planningforpregnancy': Stage.PLANNING_FOR_PREGNANCY,
                        'planning': Stage.PLANNING_FOR_PREGNANCY,
                        'newmom': Stage.NEW_MOM,
                        'new mom': Stage.NEW_MOM,
                        'exploring': Stage.EXPLORING,
                    }
                    stage = stage_map.get(stage_str.lower())

                # Parse looking_for
                looking_for_str = row.get('looking_for', '').strip()
                looking_for = None
                if looking_for_str:
                    if looking_for_str.lower() == 'self':
                        looking_for = LookingFor.SELF
                    elif 'family' in looking_for_str.lower():
                        looking_for = LookingFor.FAMILY_MEMBER

                # Parse service_enrolled
                service_str = row.get('service_enrolled', '').strip()
                service_enrolled = None
                if service_str:
                    service_map = {
                        'preconception': ServiceEnrolled.PRE_CONCEPTION,
                        'pre conception': ServiceEnrolled.PRE_CONCEPTION,
                        'antenatal': ServiceEnrolled.ANTENATAL,
                        'maternitywellness': ServiceEnrolled.MATERNITY_WELLNESS,
                        'maternity wellness': ServiceEnrolled.MATERNITY_WELLNESS,
                    }
                    service_enrolled = service_map.get(service_str.lower())

                # Parse dates
                lead_creation_date = None
                lcd_str = row.get('lead_creation_date', '').strip()
                if lcd_str:
                    try:
                        lead_creation_date = date.fromisoformat(lcd_str)
                    except:
                        pass

                consult_date_val = None
                cd_str = row.get('consult_date', '').strip()
                if cd_str:
                    try:
                        consult_date_val = date.fromisoformat(cd_str)
                    except:
                        pass

                follow_up_date = None
                fud_str = row.get('follow_up_date', '').strip()
                if fud_str:
                    try:
                        follow_up_date = datetime.fromisoformat(fud_str)
                    except:
                        pass

                # Generate lead ID
                lead_id = await generate_lead_id(db)

                # Create lead
                lead = Lead(
                    lead_id=lead_id,
                    lead_source=lead_source,
                    lead_creation_date=lead_creation_date,
                    status=lead_status,
                    name=name,
                    email=row.get('email', '').strip() or None,
                    phone_number=phone,
                    employee_id=row.get('employee_id', '').strip() or None,
                    uhid=row.get('uhid', '').strip() or None,
                    user_facility=row.get('user_facility', '').strip() or None,
                    city=row.get('city', '').strip() or None,
                    pin_code=row.get('pin_code', '').strip() or None,
                    address=row.get('address', '').strip() or None,
                    stage=stage,
                    looking_for=looking_for,
                    package_requested=row.get('package_requested', '').strip() or None,
                    service_enrolled=service_enrolled,
                    package_name_enrolled=row.get('package_name_enrolled', '').strip() or None,
                    provider_name=row.get('provider_name', '').strip() or None,
                    provider_location=row.get('provider_location', '').strip() or None,
                    hclhc_spoc=row.get('hclhc_spoc', '').strip() or None,
                    doctor_name=row.get('doctor_name', '').strip() or None,
                    consult_date=consult_date_val,
                    follow_up_date=follow_up_date,
                    created_by=current_user["user_id"],
                    assigned_to=current_user["user_id"],
                    assigned_to_name=current_user["full_name"],
                    number_of_calls=1,
                    calls=[],
                    comments=[],
                    is_deleted=False
                )

                await lead.insert()
                created_count += 1

            except Exception as e:
                errors.append({"row": row_num, "error": str(e)})

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to process file: {str(e)}"
        )

    logger.info(f"Bulk upload by {current_user['email']}: {created_count} created, {len(errors)} errors")

    return {
        "success": len(errors) == 0 or created_count > 0,
        "message": f"Processed {total_rows} rows. Created {created_count} leads." +
                   (f" {len(errors)} errors." if errors else ""),
        "total_rows": total_rows,
        "created": created_count,
        "errors": errors[:20]  # Limit errors returned
    }


@router.get("", response_model=LeadListResponse)
async def get_leads(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    status: Optional[str] = None,
    lead_source: Optional[str] = None,
    city: Optional[str] = None,
    assigned_to: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get paginated list of leads with filters
    """
    # Build query
    query = {"is_deleted": False}

    if status:
        query["status"] = status
    if lead_source:
        query["lead_source"] = lead_source
    if city:
        query["city"] = {"$regex": city, "$options": "i"}
    if assigned_to:
        query["assigned_to"] = assigned_to

    # Search by name, phone, or lead_id
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"phone_number": {"$regex": search}},
            {"lead_id": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}}
        ]

    # Count total
    total = await Lead.find(query).count()
    pages = math.ceil(total / per_page) if total > 0 else 1

    # Get paginated results
    skip = (page - 1) * per_page
    leads = await Lead.find(query).sort("-created_at").skip(skip).limit(per_page).to_list()

    return {
        "leads": [lead_to_response(lead) for lead in leads],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": pages
    }


@router.get("/{lead_id}", response_model=LeadResponse)
async def get_lead(
    lead_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get single lead by ID
    """
    lead = await Lead.find_one(Lead.lead_id == lead_id, Lead.is_deleted == False)

    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )

    return lead_to_response(lead)


@router.post("", response_model=LeadResponse)
async def create_lead(
    request: LeadCreateRequest,
    current_user: dict = Depends(get_current_admin)
):
    """
    Create a new lead (Admin only)
    """
    db = get_database()

    # Generate unique LeadID
    lead_id = await generate_lead_id(db)

    # Get assigned user name if assigned
    assigned_to_name = None
    if request.assigned_to:
        assigned_user = await User.get(request.assigned_to)
        if assigned_user:
            assigned_to_name = assigned_user.full_name

    # Create lead with new fields
    lead = Lead(
        lead_id=lead_id,
        lead_source=request.lead_source,
        lead_creation_date=request.lead_creation_date,
        name=request.name,
        email=request.email,
        phone_number=request.phone_number,
        employee_id=request.employee_id,
        uhid=request.uhid,
        user_facility=request.user_facility,
        city=request.city,
        pin_code=request.pin_code,
        address=request.address,
        stage=request.stage,
        looking_for=request.looking_for,
        package_requested=request.package_requested,
        service_enrolled=request.service_enrolled,
        package_name_enrolled=request.package_name_enrolled,
        provider_name=request.provider_name,
        provider_location=request.provider_location,
        hclhc_spoc=request.hclhc_spoc,
        follow_up_date=request.follow_up_date,
        assigned_to=request.assigned_to,
        assigned_to_name=assigned_to_name,
        created_by=current_user["user_id"],
        number_of_calls=1,
        calls=[],
        comments=[]
    )

    await lead.insert()

    # Create audit log
    audit = AuditLog(
        lead_id=lead_id,
        user_id=current_user["user_id"],
        user_email=current_user["email"],
        user_name=current_user["full_name"],
        action=AuditAction.CREATED,
        changes=[{"field": "lead", "old_value": None, "new_value": "created"}]
    )
    await audit.insert()

    logger.info(f"Lead created: {lead_id} by {current_user['email']}")

    return lead_to_response(lead)


@router.put("/{lead_id}", response_model=LeadResponse)
async def update_lead(
    lead_id: str,
    request: LeadUpdateRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Update a lead
    Agents can only update: lead_source, lead_creation_date, status, number_of_calls, calls, follow_up_date
    Admins can update all fields
    """
    lead = await Lead.find_one(Lead.lead_id == lead_id, Lead.is_deleted == False)

    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )

    # Track changes for audit
    changes = []
    update_data = request.model_dump(exclude_unset=True)

    # Agent restrictions - only allow specific fields
    if current_user["role"] == "agent":
        allowed_fields = [
            # Basic fields
            "lead_source", "lead_creation_date", "status",
            "number_of_calls", "calls", "follow_up_date",
            # Location fields
            "user_facility", "city", "pin_code", "address",
            # Healthcare fields
            "stage", "looking_for", "package_requested", "service_enrolled",
            "package_name_enrolled", "provider_name", "provider_location",
            "doctor_name", "consult_date", "hclhc_spoc"
        ]
        restricted_fields = [k for k in update_data.keys() if k not in allowed_fields]
        if restricted_fields:
            logger.warning(f"Agent {current_user['email']} tried to update restricted fields: {restricted_fields}")
        update_data = {k: v for k, v in update_data.items() if k in allowed_fields}

    # Apply updates
    for field, new_value in update_data.items():
        old_value = getattr(lead, field, None)

        # Handle enum values
        if hasattr(old_value, 'value'):
            old_value = old_value.value

        # Convert enum strings to enum values for certain fields
        if field in ["lead_source", "status", "stage", "looking_for", "service_enrolled"] and new_value:
            if isinstance(new_value, str):
                try:
                    if field == "lead_source":
                        new_value = LeadSource(new_value)
                    elif field == "status":
                        new_value = LeadStatus(new_value)
                    elif field == "stage":
                        new_value = Stage(new_value)
                    elif field == "looking_for":
                        new_value = LookingFor(new_value)
                    elif field == "service_enrolled":
                        new_value = ServiceEnrolled(new_value)
                except ValueError:
                    pass  # Keep as string if conversion fails

        if old_value != new_value:
            changes.append({
                "field": field,
                "old_value": old_value,
                "new_value": new_value.value if hasattr(new_value, 'value') else new_value
            })
            setattr(lead, field, new_value)

    # Update metadata
    lead.updated_at = datetime.utcnow()
    lead.last_modified_by = current_user["user_id"]

    await lead.save()

    # Create audit log if there are changes
    if changes:
        audit = AuditLog(
            lead_id=lead_id,
            user_id=current_user["user_id"],
            user_email=current_user["email"],
            user_name=current_user["full_name"],
            action=AuditAction.UPDATED,
            changes=changes
        )
        await audit.insert()

    logger.info(f"Lead updated: {lead_id} by {current_user['email']}")

    return lead_to_response(lead)


@router.post("/{lead_id}/comments")
async def add_comment(
    lead_id: str,
    request: CommentCreateRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Add a comment to a lead (all users can add comments)
    Comments are permanent (no edit/delete)
    """
    lead = await Lead.find_one(Lead.lead_id == lead_id, Lead.is_deleted == False)

    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )

    # Create new comment
    new_comment = {
        "text": request.text,
        "created_at": datetime.utcnow(),
        "created_by": current_user["user_id"],
        "created_by_name": current_user["full_name"]
    }

    # Add to comments list
    lead.comments.append(new_comment)
    lead.updated_at = datetime.utcnow()
    lead.last_modified_by = current_user["user_id"]

    await lead.save()

    # Create audit log
    audit = AuditLog(
        lead_id=lead_id,
        user_id=current_user["user_id"],
        user_email=current_user["email"],
        user_name=current_user["full_name"],
        action=AuditAction.UPDATED,
        changes=[{"field": "comments", "old_value": None, "new_value": f"Added comment: {request.text[:50]}..."}]
    )
    await audit.insert()

    logger.info(f"Comment added to lead {lead_id} by {current_user['email']}")

    return {
        "message": "Comment added successfully",
        "comment": new_comment
    }


@router.delete("/{lead_id}")
async def delete_lead(
    lead_id: str,
    current_user: dict = Depends(get_current_admin)
):
    """
    Soft delete a lead (Admin only)
    """
    lead = await Lead.find_one(Lead.lead_id == lead_id, Lead.is_deleted == False)

    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )

    # Soft delete
    lead.is_deleted = True
    lead.updated_at = datetime.utcnow()
    lead.last_modified_by = current_user["user_id"]
    await lead.save()

    # Create audit log
    audit = AuditLog(
        lead_id=lead_id,
        user_id=current_user["user_id"],
        user_email=current_user["email"],
        user_name=current_user["full_name"],
        action=AuditAction.DELETED,
        changes=[{"field": "is_deleted", "old_value": False, "new_value": True}]
    )
    await audit.insert()

    logger.info(f"Lead deleted: {lead_id} by {current_user['email']}")

    return {"message": "Lead deleted successfully"}


@router.get("/{lead_id}/audit")
async def get_lead_audit_trail(
    lead_id: str,
    current_user: dict = Depends(get_current_admin)
):
    """
    Get audit trail for a lead (Admin only)
    """
    lead = await Lead.find_one(Lead.lead_id == lead_id)

    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )

    audit_logs = await AuditLog.find(
        AuditLog.lead_id == lead_id
    ).sort("-timestamp").to_list()

    return {
        "lead_id": lead_id,
        "audit_trail": [
            {
                "id": str(log.id),
                "user_email": log.user_email,
                "user_name": log.user_name,
                "action": log.action,
                "changes": log.changes,
                "timestamp": log.timestamp
            }
            for log in audit_logs
        ]
    }
