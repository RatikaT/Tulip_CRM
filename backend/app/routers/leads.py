"""
Lead Management Routes
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from typing import Optional, List
from datetime import datetime, date
import csv
import io
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from app.schemas.lead import (
    LeadCreateRequest,
    LeadUpdateRequest,
    LeadResponse,
    LeadListResponse,
    CommentCreateRequest
)
from app.models.lead import Lead, LeadStatus, LeadSource, Trimester, LookingFor, ServiceEnrolled, ServicePartner, ReasonForNoSale
from app.models.audit_log import AuditLog, AuditAction
from app.models.user import User
from app.models.enrollment import Enrollment, ConnectStatus as EnrollmentConnectStatus
from app.utils.enrollment_id import generate_enrollment_id
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
        "trimester": lead.trimester.value if lead.trimester else None,
        "looking_for": lead.looking_for.value if lead.looking_for else None,
        "package_requested": lead.package_requested,

        # Service Details
        "service_enrolled": lead.service_enrolled.value if lead.service_enrolled else None,
        "package_name_enrolled": lead.package_name_enrolled,
        "service_partner": lead.service_partner.value if lead.service_partner else None,
        "provider_location": lead.provider_location,
        "hclhc_spoc": lead.hclhc_spoc,

        # Reason for No Sale
        "reason_for_no_sale": lead.reason_for_no_sale.value if lead.reason_for_no_sale else None,

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
                        'in clinic-walk in': LeadSource.IN_CLINIC_WALK_IN,
                        'mail': LeadSource.MAIL,
                        'in clinic-gynae consult': LeadSource.IN_CLINIC_GYNAE_CONSULT,
                        'bump day': LeadSource.BUMP_DAY,
                        'website': LeadSource.WEBSITE,
                        'call': LeadSource.CALL,
                        'ama': LeadSource.AMA,
                        'whatsapp': LeadSource.WHATSAPP,
                        'in clinic-other consults': LeadSource.IN_CLINIC_OTHER_CONSULTS,
                        'others': LeadSource.OTHERS,
                        # Backward compatibility mappings
                        'wa': LeadSource.WHATSAPP,
                        'sms': LeadSource.OTHERS,
                        'emr': LeadSource.OTHERS,
                        'other': LeadSource.OTHERS
                    }
                    lead_source = source_map.get(lead_source_str.lower(), LeadSource.OTHERS)
                else:
                    lead_source = LeadSource.OTHERS

                # Parse status
                status_str = row.get('status', '').strip()
                lead_status = LeadStatus.ENQUIRY_LEAD
                if status_str:
                    status_map = {
                        'not interested': LeadStatus.NOT_INTERESTED,
                        'enquiry lead': LeadStatus.ENQUIRY_LEAD,
                        'lead closed-no response': LeadStatus.LEAD_CLOSED_NO_RESPONSE,
                        'lead closed - no response': LeadStatus.LEAD_CLOSED_NO_RESPONSE,
                        'enrolled': LeadStatus.ENROLLED,
                        'follow up-in process': LeadStatus.FOLLOWUP_IN_PROCESS,
                        'follow up-no response': LeadStatus.FOLLOWUP_NO_RESPONSE,
                        'duplicate': LeadStatus.DUPLICATE,
                        # Backward compatibility
                        'new': LeadStatus.ENQUIRY_LEAD,
                        'interested': LeadStatus.ENQUIRY_LEAD,
                        'followup required': LeadStatus.FOLLOWUP_IN_PROCESS,
                        'no response': LeadStatus.FOLLOWUP_NO_RESPONSE,
                    }
                    lead_status = status_map.get(status_str.lower(), LeadStatus.ENQUIRY_LEAD)

                # Parse trimester
                trimester_str = row.get('trimester', '').strip()
                trimester = None
                if trimester_str:
                    trimester_map = {
                        'trimester 1': Trimester.TRIMESTER_1,
                        'trimester1': Trimester.TRIMESTER_1,
                        '1st': Trimester.TRIMESTER_1,
                        '1': Trimester.TRIMESTER_1,
                        'trimester 2': Trimester.TRIMESTER_2,
                        'trimester2': Trimester.TRIMESTER_2,
                        '2nd': Trimester.TRIMESTER_2,
                        '2': Trimester.TRIMESTER_2,
                        'trimester 3': Trimester.TRIMESTER_3,
                        'trimester3': Trimester.TRIMESTER_3,
                        '3rd': Trimester.TRIMESTER_3,
                        '3': Trimester.TRIMESTER_3,
                        'not conceived': Trimester.NOT_CONCEIVED,
                        'notconceived': Trimester.NOT_CONCEIVED,
                    }
                    trimester = trimester_map.get(trimester_str.lower())

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

                # Parse service_partner
                partner_str = row.get('service_partner', '').strip()
                service_partner = None
                if partner_str:
                    partner_map = {
                        'motherhood': ServicePartner.MOTHERHOOD,
                        'rainbow': ServicePartner.RAINBOW,
                        'fortis': ServicePartner.FORTIS,
                        'apollo cradle': ServicePartner.APOLLO_CRADLE,
                        'cloud 9': ServicePartner.CLOUD_9,
                        'hcl healthcare': ServicePartner.HCL_HEALTHCARE,
                        'mamily': ServicePartner.MAMILY,
                        'others': ServicePartner.OTHERS,
                    }
                    service_partner = partner_map.get(partner_str.lower(), ServicePartner.OTHERS)

                # Parse reason_for_no_sale
                reason_str = row.get('reason_for_no_sale', '').strip()
                reason_for_no_sale = None
                if reason_str:
                    reason_map = {
                        'already taking service outside': ReasonForNoSale.ALREADY_TAKING_SERVICE_OUTSIDE,
                        'location not suitable': ReasonForNoSale.LOCATION_NOT_SUITABLE,
                        'different service provider required-brand': ReasonForNoSale.DIFFERENT_SERVICE_PROVIDER_REQUIRED,
                        'travelling to native place for delivery': ReasonForNoSale.TRAVELLING_TO_NATIVE,
                        'package cost': ReasonForNoSale.PACKAGE_COST,
                        'only delivery package required': ReasonForNoSale.ONLY_DELIVERY_PACKAGE,
                        'package inadequate': ReasonForNoSale.PACKAGE_INADEQUATE,
                        'miscarriage': ReasonForNoSale.MISCARRIAGE,
                        'looking for other hclh services': ReasonForNoSale.LOOKING_FOR_OTHER_HCLH,
                        'others': ReasonForNoSale.OTHERS,
                    }
                    reason_for_no_sale = reason_map.get(reason_str.lower())

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
                    trimester=trimester,
                    looking_for=looking_for,
                    package_requested=row.get('package_requested', '').strip() or None,
                    service_enrolled=service_enrolled,
                    package_name_enrolled=row.get('package_name_enrolled', '').strip() or None,
                    service_partner=service_partner,
                    provider_location=row.get('provider_location', '').strip() or None,
                    hclhc_spoc=row.get('hclhc_spoc', '').strip() or None,
                    reason_for_no_sale=reason_for_no_sale,
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


@router.get("/export/excel")
async def export_leads_excel(
    current_user: dict = Depends(get_current_admin)
):
    """
    Export all leads with audit trail to Excel (Admin only)
    """
    # Create workbook
    wb = Workbook()

    # Styles
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
    header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin_border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )

    # ===== Sheet 1: Leads =====
    ws_leads = wb.active
    ws_leads.title = "Leads"

    # Lead headers
    lead_headers = [
        "Lead ID", "Name", "Email", "Phone Number", "Employee ID", "UHID",
        "Status", "Lead Source", "Lead Creation Date", "Trimester", "Looking For",
        "User Facility", "City", "Pin Code", "Address",
        "Package Requested", "Service Enrolled", "Package Name Enrolled",
        "Service (Partner)", "Provider Location", "HCLHC SPOC", "Reason for No Sale",
        "Doctor Name", "Consult Date",
        "Number of Calls", "Follow Up Date",
        "Assigned To", "Reassign To",
        "Created At", "Updated At", "Created By"
    ]

    # Write headers
    for col, header in enumerate(lead_headers, 1):
        cell = ws_leads.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_alignment
        cell.border = thin_border

    # Fetch all leads
    leads = await Lead.find(Lead.is_deleted == False).sort("-created_at").to_list()

    # Write lead data
    for row_num, lead in enumerate(leads, 2):
        row_data = [
            lead.lead_id,
            lead.name,
            lead.email,
            lead.phone_number,
            lead.employee_id,
            lead.uhid,
            lead.status.value if lead.status else None,
            lead.lead_source.value if lead.lead_source else None,
            str(lead.lead_creation_date) if lead.lead_creation_date else None,
            lead.trimester.value if lead.trimester else None,
            lead.looking_for.value if lead.looking_for else None,
            lead.user_facility,
            lead.city,
            lead.pin_code,
            lead.address,
            lead.package_requested,
            lead.service_enrolled.value if lead.service_enrolled else None,
            lead.package_name_enrolled,
            lead.service_partner.value if lead.service_partner else None,
            lead.provider_location,
            lead.hclhc_spoc,
            lead.reason_for_no_sale.value if lead.reason_for_no_sale else None,
            lead.doctor_name,
            str(lead.consult_date) if lead.consult_date else None,
            lead.number_of_calls,
            lead.follow_up_date.strftime("%Y-%m-%d %H:%M") if lead.follow_up_date else None,
            lead.assigned_to_name,
            getattr(lead, 'reassign_to_name', None),
            lead.created_at.strftime("%Y-%m-%d %H:%M") if lead.created_at else None,
            lead.updated_at.strftime("%Y-%m-%d %H:%M") if lead.updated_at else None,
            lead.created_by
        ]

        for col, value in enumerate(row_data, 1):
            cell = ws_leads.cell(row=row_num, column=col, value=value)
            cell.border = thin_border
            cell.alignment = Alignment(vertical="center")

    # Auto-adjust column widths for leads sheet
    for col in ws_leads.columns:
        max_length = 0
        column = col[0].column_letter
        for cell in col:
            try:
                if len(str(cell.value)) > max_length:
                    max_length = len(str(cell.value))
            except:
                pass
        adjusted_width = min(max_length + 2, 50)
        ws_leads.column_dimensions[column].width = adjusted_width

    # ===== Sheet 2: Calls =====
    ws_calls = wb.create_sheet("Calls")

    call_headers = ["Lead ID", "Name", "Call Number", "Date & Time", "Summary"]
    for col, header in enumerate(call_headers, 1):
        cell = ws_calls.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_alignment
        cell.border = thin_border

    call_row = 2
    for lead in leads:
        if lead.calls:
            for call in lead.calls:
                ws_calls.cell(row=call_row, column=1, value=lead.lead_id).border = thin_border
                ws_calls.cell(row=call_row, column=2, value=lead.name).border = thin_border
                ws_calls.cell(row=call_row, column=3, value=call.get('call_number', '')).border = thin_border
                ws_calls.cell(row=call_row, column=4, value=call.get('date_time', '')).border = thin_border
                ws_calls.cell(row=call_row, column=5, value=call.get('summary', '')).border = thin_border
                call_row += 1

    # Auto-adjust column widths for calls sheet
    for col in ws_calls.columns:
        max_length = 0
        column = col[0].column_letter
        for cell in col:
            try:
                if len(str(cell.value)) > max_length:
                    max_length = len(str(cell.value))
            except:
                pass
        adjusted_width = min(max_length + 2, 60)
        ws_calls.column_dimensions[column].width = adjusted_width

    # ===== Sheet 3: Comments =====
    ws_comments = wb.create_sheet("Comments")

    comment_headers = ["Lead ID", "Name", "Comment", "Created By", "Created At"]
    for col, header in enumerate(comment_headers, 1):
        cell = ws_comments.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_alignment
        cell.border = thin_border

    comment_row = 2
    for lead in leads:
        if lead.comments:
            for comment in lead.comments:
                ws_comments.cell(row=comment_row, column=1, value=lead.lead_id).border = thin_border
                ws_comments.cell(row=comment_row, column=2, value=lead.name).border = thin_border
                ws_comments.cell(row=comment_row, column=3, value=comment.get('text', '')).border = thin_border
                ws_comments.cell(row=comment_row, column=4, value=comment.get('created_by_name', '')).border = thin_border
                created_at = comment.get('created_at')
                if created_at:
                    if isinstance(created_at, datetime):
                        created_at = created_at.strftime("%Y-%m-%d %H:%M")
                ws_comments.cell(row=comment_row, column=5, value=created_at).border = thin_border
                comment_row += 1

    # Auto-adjust column widths for comments sheet
    for col in ws_comments.columns:
        max_length = 0
        column = col[0].column_letter
        for cell in col:
            try:
                if len(str(cell.value)) > max_length:
                    max_length = len(str(cell.value))
            except:
                pass
        adjusted_width = min(max_length + 2, 60)
        ws_comments.column_dimensions[column].width = adjusted_width

    # ===== Sheet 4: Audit Trail =====
    ws_audit = wb.create_sheet("Audit Trail")

    audit_headers = ["Lead ID", "User", "Email", "Action", "Field", "Old Value", "New Value", "Timestamp"]
    for col, header in enumerate(audit_headers, 1):
        cell = ws_audit.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_alignment
        cell.border = thin_border

    # Fetch all audit logs
    audit_logs = await AuditLog.find().sort("-timestamp").to_list()

    audit_row = 2
    for log in audit_logs:
        if log.changes:
            for change in log.changes:
                ws_audit.cell(row=audit_row, column=1, value=log.lead_id).border = thin_border
                ws_audit.cell(row=audit_row, column=2, value=log.user_name).border = thin_border
                ws_audit.cell(row=audit_row, column=3, value=log.user_email).border = thin_border
                ws_audit.cell(row=audit_row, column=4, value=log.action.value if hasattr(log.action, 'value') else str(log.action)).border = thin_border
                ws_audit.cell(row=audit_row, column=5, value=change.get('field', '')).border = thin_border
                ws_audit.cell(row=audit_row, column=6, value=str(change.get('old_value', ''))).border = thin_border
                ws_audit.cell(row=audit_row, column=7, value=str(change.get('new_value', ''))).border = thin_border
                ws_audit.cell(row=audit_row, column=8, value=log.timestamp.strftime("%Y-%m-%d %H:%M") if log.timestamp else None).border = thin_border
                audit_row += 1
        else:
            ws_audit.cell(row=audit_row, column=1, value=log.lead_id).border = thin_border
            ws_audit.cell(row=audit_row, column=2, value=log.user_name).border = thin_border
            ws_audit.cell(row=audit_row, column=3, value=log.user_email).border = thin_border
            ws_audit.cell(row=audit_row, column=4, value=log.action.value if hasattr(log.action, 'value') else str(log.action)).border = thin_border
            ws_audit.cell(row=audit_row, column=8, value=log.timestamp.strftime("%Y-%m-%d %H:%M") if log.timestamp else None).border = thin_border
            audit_row += 1

    # Auto-adjust column widths for audit sheet
    for col in ws_audit.columns:
        max_length = 0
        column = col[0].column_letter
        for cell in col:
            try:
                if len(str(cell.value)) > max_length:
                    max_length = len(str(cell.value))
            except:
                pass
        adjusted_width = min(max_length + 2, 50)
        ws_audit.column_dimensions[column].width = adjusted_width

    # Save to bytes
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    # Generate filename with timestamp
    filename = f"leads_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"

    logger.info(f"Excel export generated by {current_user['email']}: {len(leads)} leads, {len(audit_logs)} audit entries")

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


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
        trimester=request.trimester,
        looking_for=request.looking_for,
        package_requested=request.package_requested,
        service_enrolled=request.service_enrolled,
        package_name_enrolled=request.package_name_enrolled,
        service_partner=request.service_partner,
        provider_location=request.provider_location,
        hclhc_spoc=request.hclhc_spoc,
        reason_for_no_sale=request.reason_for_no_sale,
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
            "trimester", "looking_for", "package_requested", "service_enrolled",
            "package_name_enrolled", "service_partner", "provider_location",
            "doctor_name", "consult_date", "hclhc_spoc", "reason_for_no_sale"
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
        if field in ["lead_source", "status", "trimester", "looking_for", "service_enrolled", "service_partner", "reason_for_no_sale"] and new_value:
            if isinstance(new_value, str):
                try:
                    if field == "lead_source":
                        new_value = LeadSource(new_value)
                    elif field == "status":
                        new_value = LeadStatus(new_value)
                    elif field == "trimester":
                        new_value = Trimester(new_value)
                    elif field == "looking_for":
                        new_value = LookingFor(new_value)
                    elif field == "service_enrolled":
                        new_value = ServiceEnrolled(new_value)
                    elif field == "service_partner":
                        new_value = ServicePartner(new_value)
                    elif field == "reason_for_no_sale":
                        new_value = ReasonForNoSale(new_value)
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

    # Auto-enrollment: Create enrollment when status changes to "Enrolled"
    status_change = next((c for c in changes if c["field"] == "status" and c["new_value"] == LeadStatus.ENROLLED.value), None)
    if status_change:
        try:
            db = get_database()
            enrollment_id = await generate_enrollment_id(db)

            # Map lead's service_partner to enrollment's service_partner
            service_partner_value = None
            if lead.service_partner:
                from app.models.enrollment import ServicePartner as EnrollmentServicePartner
                try:
                    service_partner_value = EnrollmentServicePartner(lead.service_partner.value)
                except ValueError:
                    pass

            # Map trimester
            trimester_value = None
            if lead.trimester:
                from app.models.enrollment import Trimester as EnrollmentTrimester
                try:
                    trimester_value = EnrollmentTrimester(lead.trimester.value)
                except ValueError:
                    pass

            enrollment = Enrollment(
                enrollment_id=enrollment_id,
                linked_lead_id=lead.lead_id,
                subscriber_name=lead.name,
                employee_id=lead.employee_id or "",
                phone_number=lead.phone_number,
                email=lead.email,
                trimester=trimester_value,
                doctor_name=lead.doctor_name,
                service_partner=service_partner_value,
                hclhc_spoc=lead.hclhc_spoc,
                connect_status=EnrollmentConnectStatus.CONNECTED,
                created_by=current_user["user_id"],
                created_by_name=current_user["full_name"],
                assigned_to=current_user["user_id"],
                assigned_to_name=current_user["full_name"],
            )
            await enrollment.insert()
            logger.info(f"Auto-created enrollment {enrollment_id} for lead {lead_id}")
        except Exception as e:
            logger.error(f"Failed to auto-create enrollment for lead {lead_id}: {str(e)}")

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
