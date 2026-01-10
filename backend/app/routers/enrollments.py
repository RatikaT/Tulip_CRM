"""
Enrollment Management Routes
"""
# Updated: Bug fixes for bulk upload
from fastapi import APIRouter, HTTPException, status, Depends, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from typing import Optional, List
from datetime import datetime, date
import csv
import io
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from app.schemas.enrollment import (
    EnrollmentCreateRequest,
    EnrollmentUpdateRequest,
    EnrollmentResponse,
    EnrollmentListResponse,
    EnrollmentStatsResponse,
    FollowUpCreateRequest,
    BulkUploadResponse
)
from app.models.enrollment import Enrollment, ConnectStatus, ActionTaken
from app.models.lead import Trimester, ServicePartner
from app.models.audit_log import AuditLog, AuditAction
from app.models.user import User
from app.middleware.auth_middleware import get_current_user, get_current_admin
from app.database import get_database
import logging
import math
import re

logger = logging.getLogger(__name__)

router = APIRouter()


async def generate_enrollment_id() -> str:
    """Generate unique enrollment ID: ENR_DDMMYYYY_XXX"""
    today = datetime.now()
    date_str = today.strftime("%d%m%Y")
    prefix = f"ENR_{date_str}_"

    # Find the highest number for today using regex
    existing = await Enrollment.find(
        {"enrollment_id": {"$regex": f"^{prefix}"}}
    ).sort("-enrollment_id").first_or_none()

    if existing:
        # Extract the number part and increment
        try:
            last_num = int(existing.enrollment_id.split("_")[-1])
            new_num = last_num + 1
        except (ValueError, IndexError):
            new_num = 1
    else:
        new_num = 1

    return f"{prefix}{new_num:03d}"


def enrollment_to_response(enrollment: Enrollment) -> dict:
    """Convert Enrollment document to response dict"""
    return {
        "id": str(enrollment.id),
        "enrollment_id": enrollment.enrollment_id,
        "linked_lead_id": enrollment.linked_lead_id,

        # Timestamps
        "created_at": enrollment.created_at,
        "updated_at": enrollment.updated_at,

        # Billing Info
        "billed_date": enrollment.billed_date,
        "package_billed": enrollment.package_billed,

        # HCLH Details
        "hclhc_spoc": enrollment.hclhc_spoc,
        "hcl_location": enrollment.hcl_location,

        # User Details
        "uhid": enrollment.uhid,
        "subscriber_name": enrollment.subscriber_name,
        "dob": enrollment.dob,
        "employee_code": enrollment.employee_code,
        "employee_name": enrollment.employee_name,
        "phone_number": enrollment.phone_number,
        "email": enrollment.email,
        "address": enrollment.address,

        # Service Details
        "trimester": enrollment.trimester.value if enrollment.trimester else None,
        "hclhc_doctor": enrollment.hclhc_doctor,
        "service_partner": enrollment.service_partner.value if enrollment.service_partner else None,
        "partner_centre_selected": enrollment.partner_centre_selected,
        "partner_gynaecologist": enrollment.partner_gynaecologist,

        # Status
        "connect_status": enrollment.connect_status.value if enrollment.connect_status else None,
        "action_taken": enrollment.action_taken.value if enrollment.action_taken else None,

        # Follow-up Tracking
        "follow_up_date": enrollment.follow_up_date,
        "customer_feedback": enrollment.customer_feedback,
        "remarks": enrollment.remarks,

        # Follow-ups History
        "follow_ups": enrollment.follow_ups,

        # Assignment
        "assigned_to": enrollment.assigned_to,
        "assigned_to_name": enrollment.assigned_to_name,

        # System
        "created_by": enrollment.created_by,
        "created_by_name": enrollment.created_by_name,
    }


@router.get("/stats", response_model=EnrollmentStatsResponse)
async def get_enrollment_stats(
    current_user: dict = Depends(get_current_user)
):
    """Get enrollment statistics by partner and status"""
    # Total count
    total = await Enrollment.find(Enrollment.is_deleted == False).count()

    # By partner
    by_partner = {}
    for partner in ServicePartner:
        count = await Enrollment.find(
            Enrollment.is_deleted == False,
            Enrollment.service_partner == partner
        ).count()
        if count > 0:
            by_partner[partner.value] = count

    # By connect status
    by_status = {}
    for status in ConnectStatus:
        count = await Enrollment.find(
            Enrollment.is_deleted == False,
            Enrollment.connect_status == status
        ).count()
        if count > 0:
            by_status[status.value] = count

    return {
        "total": total,
        "by_partner": by_partner,
        "by_status": by_status
    }


@router.post("/bulk-upload", response_model=BulkUploadResponse)
async def bulk_upload_enrollments(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_admin)
):
    """Bulk upload enrollments from CSV file (Admin only)"""
    if not file.filename.endswith('.csv'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV files are supported"
        )

    errors = []
    created_count = 0
    total_rows = 0

    try:
        contents = await file.read()
        decoded = contents.decode('utf-8-sig')
        reader = csv.DictReader(io.StringIO(decoded))

        for row_num, row in enumerate(reader, start=2):
            total_rows += 1
            try:
                # Required fields
                subscriber_name = row.get('Subscriber Name', row.get('subscriber_name', '')).strip()
                employee_id = row.get('EmployeeID', row.get('employee_id', '')).strip()
                phone = row.get('Phone Number', row.get('phone_number', '')).strip()

                if not subscriber_name:
                    errors.append({"row": row_num, "error": "Subscriber Name is required"})
                    continue
                if not employee_id:
                    errors.append({"row": row_num, "error": "EmployeeID is required"})
                    continue
                if not phone or len(phone) != 10 or not phone.isdigit():
                    errors.append({"row": row_num, "error": f"Invalid phone number: {phone}"})
                    continue

                # Parse service partner
                partner_str = row.get('Service (Partner)', row.get('service_partner', '')).strip()
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

                # Parse connect status
                status_str = row.get('Connect Status', row.get('connect_status', '')).strip()
                connect_status = None
                if status_str:
                    status_map = {
                        'connected': ConnectStatus.CONNECTED,
                        'no response': ConnectStatus.NO_RESPONSE,
                        'follow up required': ConnectStatus.FOLLOW_UP_REQUIRED,
                        'others': ConnectStatus.OTHERS,
                    }
                    connect_status = status_map.get(status_str.lower())

                # Parse action taken
                action_str = row.get('Action Taken', row.get('action_taken', '')).strip()
                action_taken = None
                if action_str:
                    action_map = {
                        'appointment booked': ActionTaken.APPOINTMENT_BOOKED,
                        'feedback taken': ActionTaken.FEEDBACK_TAKEN,
                        'no action required': ActionTaken.NO_ACTION_REQUIRED,
                        'liasoned with partner team': ActionTaken.LIASONED_WITH_PARTNER,
                    }
                    action_taken = action_map.get(action_str.lower())

                # Parse trimester
                trimester_str = row.get('Current Trimester', row.get('trimester', '')).strip()
                trimester = None
                if trimester_str:
                    trimester_map = {
                        'trimester 1': Trimester.TRIMESTER_1,
                        'trimester1': Trimester.TRIMESTER_1,
                        '1': Trimester.TRIMESTER_1,
                        'trimester 2': Trimester.TRIMESTER_2,
                        'trimester2': Trimester.TRIMESTER_2,
                        '2': Trimester.TRIMESTER_2,
                        'trimester 3': Trimester.TRIMESTER_3,
                        'trimester3': Trimester.TRIMESTER_3,
                        '3': Trimester.TRIMESTER_3,
                        'not conceived': Trimester.NOT_CONCEIVED,
                    }
                    trimester = trimester_map.get(trimester_str.lower())

                # Parse dates
                billed_date = None
                billed_str = row.get('Billed Date', row.get('billed_date', '')).strip()
                if billed_str:
                    try:
                        for fmt in ['%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y']:
                            try:
                                billed_date = datetime.strptime(billed_str, fmt).date()
                                break
                            except ValueError:
                                continue
                    except:
                        pass

                dob = None
                dob_str = row.get('DOB', row.get('dob', '')).strip()
                if dob_str:
                    try:
                        for fmt in ['%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y']:
                            try:
                                dob = datetime.strptime(dob_str, fmt).date()
                                break
                            except ValueError:
                                continue
                    except:
                        pass

                follow_up_date = None
                follow_str = row.get('Follow Up Date', row.get('follow_up_date', '')).strip()
                if follow_str:
                    try:
                        for fmt in ['%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y']:
                            try:
                                follow_up_date = datetime.strptime(follow_str, fmt)
                                break
                            except ValueError:
                                continue
                    except:
                        pass

                # Create enrollment
                enrollment = Enrollment(
                    enrollment_id=await generate_enrollment_id(),
                    subscriber_name=subscriber_name,
                    employee_code=employee_id,
                    phone_number=phone,
                    email=row.get('Email', row.get('email', '')).strip() or None,
                    billed_date=billed_date,
                    package_billed=row.get('Package Billed', row.get('package_billed', '')).strip() or None,
                    hclhc_spoc=row.get('HCLH SPOC', row.get('hclhc_spoc', '')).strip() or None,
                    hcl_location=row.get('HCL Location', row.get('hcl_location', '')).strip() or None,
                    uhid=row.get('UHID', row.get('uhid', '')).strip() or None,
                    dob=dob,
                    employee_name=row.get('Name', row.get('employee_name', '')).strip() or None,
                    address=row.get('Address', row.get('address', '')).strip() or None,
                    trimester=trimester,
                    hclhc_doctor=row.get('Doctor Name', row.get('hclhc_doctor', '')).strip() or None,
                    service_partner=service_partner,
                    partner_centre_selected=row.get('Partner Centre Selected', row.get('partner_centre_selected', '')).strip() or None,
                    partner_gynaecologist=row.get('Partner Gynaecologist', row.get('partner_gynaecologist', '')).strip() or None,
                    connect_status=connect_status,
                    action_taken=action_taken,
                    follow_up_date=follow_up_date,
                    customer_feedback=row.get('Customer Feedback', row.get('customer_feedback', '')).strip() or None,
                    remarks=row.get('Remarks', row.get('remarks', '')).strip() or None,
                    created_by=current_user["user_id"],
                    created_by_name=current_user.get("full_name", current_user["email"]),
                    assigned_to=current_user["user_id"],
                    assigned_to_name=current_user.get("full_name", current_user["email"]),
                )
                await enrollment.insert()
                created_count += 1

            except Exception as e:
                errors.append({"row": row_num, "error": str(e)})

        logger.info(f"Bulk upload by {current_user['email']}: {created_count}/{total_rows} created")

        return {
            "success": True,
            "message": f"Processed {total_rows} rows. Created {created_count} enrollments. {len(errors)} errors.",
            "total_rows": total_rows,
            "created": created_count,
            "errors": errors
        }

    except Exception as e:
        logger.error(f"Bulk upload error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to process file: {str(e)}"
        )


@router.get("/export/excel")
async def export_enrollments_excel(
    current_user: dict = Depends(get_current_admin)
):
    """Export all enrollments to Excel (Admin only)"""
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

    # Sheet 1: Enrollments
    ws = wb.active
    ws.title = "Enrollments"

    headers = [
        "Enrollment ID", "Linked Lead", "Billed Date", "Package Billed",
        "HCLH SPOC", "HCL Location", "UHID", "Subscriber Name", "DOB",
        "EmployeeID", "Name", "Phone Number", "Email", "Address",
        "Current Trimester", "Doctor Name", "Service (Partner)", "Partner Centre Selected", "Partner Gynaecologist",
        "Connect Status", "Action Taken", "Follow Up Date",
        "Customer Feedback", "Remarks", "Assigned To", "Created At"
    ]

    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_alignment
        cell.border = thin_border

    enrollments = await Enrollment.find(Enrollment.is_deleted == False).sort("-created_at").to_list()

    for row_num, enrollment in enumerate(enrollments, 2):
        row_data = [
            enrollment.enrollment_id,
            enrollment.linked_lead_id,
            str(enrollment.billed_date) if enrollment.billed_date else None,
            enrollment.package_billed,
            enrollment.hclhc_spoc,
            enrollment.hcl_location,
            enrollment.uhid,
            enrollment.subscriber_name,
            str(enrollment.dob) if enrollment.dob else None,
            enrollment.employee_code,
            enrollment.employee_name,
            enrollment.phone_number,
            enrollment.email,
            enrollment.address,
            enrollment.trimester.value if enrollment.trimester else None,
            enrollment.hclhc_doctor,
            enrollment.service_partner.value if enrollment.service_partner else None,
            enrollment.partner_centre_selected,
            enrollment.partner_gynaecologist,
            enrollment.connect_status.value if enrollment.connect_status else None,
            enrollment.action_taken.value if enrollment.action_taken else None,
            enrollment.follow_up_date.strftime("%Y-%m-%d %H:%M") if enrollment.follow_up_date else None,
            enrollment.customer_feedback,
            enrollment.remarks,
            enrollment.assigned_to_name,
            enrollment.created_at.strftime("%Y-%m-%d %H:%M") if enrollment.created_at else None,
        ]

        for col, value in enumerate(row_data, 1):
            cell = ws.cell(row=row_num, column=col, value=value)
            cell.border = thin_border

    # Auto-adjust column widths
    for col in ws.columns:
        max_length = 0
        column = col[0].column_letter
        for cell in col:
            try:
                if len(str(cell.value)) > max_length:
                    max_length = len(str(cell.value))
            except:
                pass
        ws.column_dimensions[column].width = min(max_length + 2, 50)

    # Sheet 2: Follow-ups
    ws_followups = wb.create_sheet("Follow-ups")
    followup_headers = ["Enrollment ID", "Subscriber Name", "Follow-up #", "Date", "Connect Status", "Action Taken", "Feedback", "Remarks", "Created By"]

    for col, header in enumerate(followup_headers, 1):
        cell = ws_followups.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_alignment
        cell.border = thin_border

    followup_row = 2
    for enrollment in enrollments:
        for followup in enrollment.follow_ups:
            ws_followups.cell(row=followup_row, column=1, value=enrollment.enrollment_id).border = thin_border
            ws_followups.cell(row=followup_row, column=2, value=enrollment.subscriber_name).border = thin_border
            ws_followups.cell(row=followup_row, column=3, value=followup.get('follow_up_number', '')).border = thin_border
            ws_followups.cell(row=followup_row, column=4, value=followup.get('date', '')).border = thin_border
            ws_followups.cell(row=followup_row, column=5, value=followup.get('connect_status', '')).border = thin_border
            ws_followups.cell(row=followup_row, column=6, value=followup.get('action_taken', '')).border = thin_border
            ws_followups.cell(row=followup_row, column=7, value=followup.get('feedback', '')).border = thin_border
            ws_followups.cell(row=followup_row, column=8, value=followup.get('remarks', '')).border = thin_border
            ws_followups.cell(row=followup_row, column=9, value=followup.get('created_by_name', '')).border = thin_border
            followup_row += 1

    # Auto-adjust follow-ups sheet
    for col in ws_followups.columns:
        max_length = 0
        column = col[0].column_letter
        for cell in col:
            try:
                if len(str(cell.value)) > max_length:
                    max_length = len(str(cell.value))
            except:
                pass
        ws_followups.column_dimensions[column].width = min(max_length + 2, 50)

    # Save to bytes
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    filename = f"enrollments_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("", response_model=EnrollmentListResponse)
async def get_enrollments(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    search: Optional[str] = None,
    connect_status: Optional[str] = None,
    action_taken: Optional[str] = None,
    service_partner: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get enrollments with pagination and filters"""
    try:
        query = {"is_deleted": False}

        # Apply filters
        if connect_status:
            query["connect_status"] = connect_status
        if action_taken:
            query["action_taken"] = action_taken
        if service_partner:
            query["service_partner"] = service_partner

        # Search (escape regex special chars for security)
        if search:
            escaped_search = re.escape(search)
            query["$or"] = [
                {"subscriber_name": {"$regex": escaped_search, "$options": "i"}},
                {"employee_code": {"$regex": escaped_search, "$options": "i"}},
                {"employee_name": {"$regex": escaped_search, "$options": "i"}},
                {"phone_number": {"$regex": escaped_search}},
                {"enrollment_id": {"$regex": escaped_search, "$options": "i"}},
                {"email": {"$regex": escaped_search, "$options": "i"}}
            ]

        # Get total count
        total = await Enrollment.find(query).count()
        pages = math.ceil(total / per_page) if total > 0 else 1

        # Pagination
        skip = (page - 1) * per_page
        enrollments = await Enrollment.find(query).sort("-created_at").skip(skip).limit(per_page).to_list()

        return {
            "enrollments": [enrollment_to_response(e) for e in enrollments],
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": pages
        }
    except Exception as e:
        logger.error(f"Error in get_enrollments: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=EnrollmentResponse)
async def create_enrollment(
    enrollment_data: EnrollmentCreateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Create a new enrollment"""
    enrollment = Enrollment(
        enrollment_id=await generate_enrollment_id(),
        **enrollment_data.model_dump(exclude_unset=True),
        created_by=current_user["user_id"],
        created_by_name=current_user.get("full_name", current_user["email"]),
        assigned_to=enrollment_data.assigned_to or current_user["user_id"],
        assigned_to_name=current_user.get("full_name", current_user["email"]),
    )
    await enrollment.insert()

    logger.info(f"Enrollment {enrollment.enrollment_id} created by {current_user['email']}")

    return enrollment_to_response(enrollment)


@router.get("/{enrollment_id}", response_model=EnrollmentResponse)
async def get_enrollment(
    enrollment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single enrollment by ID"""
    enrollment = await Enrollment.find_one(
        Enrollment.enrollment_id == enrollment_id,
        Enrollment.is_deleted == False
    )
    if not enrollment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enrollment not found"
        )
    return enrollment_to_response(enrollment)


@router.put("/{enrollment_id}", response_model=EnrollmentResponse)
async def update_enrollment(
    enrollment_id: str,
    update_data: EnrollmentUpdateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Update an enrollment"""
    logger.debug(f"Updating enrollment {enrollment_id} by user={current_user['email']}")
    enrollment = await Enrollment.find_one(
        Enrollment.enrollment_id == enrollment_id,
        Enrollment.is_deleted == False
    )
    if not enrollment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enrollment not found"
        )

    # Update fields
    update_dict = update_data.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(enrollment, field, value)

    enrollment.updated_at = datetime.utcnow()
    enrollment.last_modified_by = current_user["user_id"]
    await enrollment.save()

    logger.info(f"Enrollment {enrollment_id} updated by {current_user['email']}")

    return enrollment_to_response(enrollment)


@router.delete("/{enrollment_id}")
async def delete_enrollment(
    enrollment_id: str,
    current_user: dict = Depends(get_current_admin)
):
    """Soft delete an enrollment (Admin only)"""
    logger.debug(f"Deleting enrollment {enrollment_id} by user={current_user['email']}")
    enrollment = await Enrollment.find_one(
        Enrollment.enrollment_id == enrollment_id,
        Enrollment.is_deleted == False
    )
    if not enrollment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enrollment not found"
        )

    enrollment.is_deleted = True
    enrollment.updated_at = datetime.utcnow()
    await enrollment.save()

    logger.info(f"Enrollment {enrollment_id} deleted by {current_user['email']}")

    return {"message": "Enrollment deleted successfully"}


@router.post("/{enrollment_id}/follow-ups", response_model=EnrollmentResponse)
async def add_follow_up(
    enrollment_id: str,
    follow_up_data: FollowUpCreateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Add a follow-up entry to an enrollment"""
    enrollment = await Enrollment.find_one(
        Enrollment.enrollment_id == enrollment_id,
        Enrollment.is_deleted == False
    )
    if not enrollment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enrollment not found"
        )

    # Create follow-up entry
    follow_up_number = len(enrollment.follow_ups) + 1
    follow_up_entry = {
        "follow_up_number": follow_up_number,
        "date": datetime.utcnow().isoformat(),
        "connect_status": follow_up_data.connect_status.value if follow_up_data.connect_status else None,
        "action_taken": follow_up_data.action_taken.value if follow_up_data.action_taken else None,
        "feedback": follow_up_data.feedback,
        "remarks": follow_up_data.remarks,
        "created_by": current_user["user_id"],
        "created_by_name": current_user.get("full_name", current_user["email"]),
        "created_at": datetime.utcnow().isoformat()
    }

    enrollment.follow_ups.append(follow_up_entry)

    # Update current status fields
    if follow_up_data.connect_status:
        enrollment.connect_status = follow_up_data.connect_status
    if follow_up_data.action_taken:
        enrollment.action_taken = follow_up_data.action_taken
    if follow_up_data.feedback:
        enrollment.customer_feedback = follow_up_data.feedback
    if follow_up_data.remarks:
        enrollment.remarks = follow_up_data.remarks
    if follow_up_data.follow_up_date:
        enrollment.follow_up_date = follow_up_data.follow_up_date

    enrollment.updated_at = datetime.utcnow()
    await enrollment.save()

    logger.info(f"Follow-up #{follow_up_number} added to {enrollment_id} by {current_user['email']}")

    return enrollment_to_response(enrollment)
