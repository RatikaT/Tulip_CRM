"""
Dashboard Routes - Metrics and Analytics
Updated with enrollment metrics
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, timedelta, date
from typing import Optional, List
from app.models.lead import Lead, LeadStatus
from app.models.user import User
from app.models.summary import Summary, SummaryType
from app.models.audit_log import AuditLog, AuditAction
from app.models.enrollment import Enrollment
from app.models.enrollment_audit_log import EnrollmentAuditLog, EnrollmentAuditAction
from app.middleware.auth_middleware import get_current_user, get_current_admin
from app.database import get_database
from bson import ObjectId
import logging
import re

logger = logging.getLogger(__name__)

router = APIRouter()


# Application timezone — all "today" buckets on the dashboard are IST.
IST_OFFSET = timedelta(hours=5, minutes=30)


def _ist_today_utc_bounds():
    """Return (start, end) UTC datetimes covering the current IST calendar day.

    Computed from UTC explicitly so the result is correct regardless of the
    host's local timezone (Render/Vercel hosts typically run in UTC).
    """
    now_ist = datetime.utcnow() + IST_OFFSET
    ist_midnight = datetime.combine(now_ist.date(), datetime.min.time())
    start_utc = ist_midnight - IST_OFFSET
    end_utc = start_utc + timedelta(days=1)
    return start_utc, end_utc


async def _daily_lead_counts(base_query: dict, today_start_utc: datetime, days: int):
    """Daily lead-creation counts for the last `days` IST days ending today.

    Both the bucketing ($dateToString with Asia/Kolkata) and the zero-fill
    labels are in IST so the series aligns properly across the IST/UTC
    boundary — otherwise leads created between 00:00 and 05:29 IST fall into
    the next UTC day and disappear off the end of the chart.
    """
    window_start_utc = today_start_utc - timedelta(days=days - 1)
    pipeline = [
        {"$match": {**base_query, "created_at": {"$gte": window_start_utc}}},
        {"$group": {
            "_id": {"$dateToString": {
                "format": "%Y-%m-%d",
                "date": "$created_at",
                "timezone": "Asia/Kolkata",
            }},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]
    rows = await get_database().leads.aggregate(pipeline).to_list(1000)
    by_date = {row["_id"]: row["count"] for row in rows}
    # Labels are IST calendar dates; derive them by adding IST offset to UTC.
    window_start_ist = window_start_utc + IST_OFFSET
    return [
        {
            "date": (window_start_ist + timedelta(days=i)).strftime("%Y-%m-%d"),
            "count": by_date.get((window_start_ist + timedelta(days=i)).strftime("%Y-%m-%d"), 0),
        }
        for i in range(days)
    ]


class SummaryCreateRequest(BaseModel):
    summary_type: str
    content: str
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    summary_date: Optional[str] = None
    total_leads: int = 0
    status_distribution: dict = {}
    source_distribution: dict = {}
    service_distribution: dict = {}
    # For daily agent activity summaries
    activity_metrics: Optional[dict] = None
    lead_details: Optional[dict] = None


@router.get("/metrics")
async def get_dashboard_metrics(
    current_user: dict = Depends(get_current_user)
):
    """
    Get dashboard metrics for all users
    """
    # All timestamps in MongoDB are stored as UTC. We operate in IST regardless
    # of host timezone, so derive IST "today" from UTC and convert back to UTC
    # for the actual queries.
    today_start_utc, today_end_utc = _ist_today_utc_bounds()

    # Base query - exclude deleted leads (handles both existing and missing is_deleted field)
    # and exclude duplicate leads (pending/confirmed) from dashboard counts
    base_query = {
        "$or": [{"is_deleted": False}, {"is_deleted": {"$exists": False}}],
        "duplicate_status": {"$in": [None, "not_duplicate"]},
    }

    # Total leads (unique — duplicates are excluded by base_query)
    total_leads = await Lead.find(base_query).count()

    # Duplicate leads — flagged (pending/confirmed) and hidden from the lists,
    # but still counted so the Total Leads card can show where they went.
    duplicate_leads = await Lead.find({
        "$or": [{"is_deleted": False}, {"is_deleted": {"$exists": False}}],
        "duplicate_status": {"$in": ["pending", "confirmed"]},
    }).count()

    # Unique users (by employee_id)
    pipeline = [
        {"$match": {"is_deleted": False, "employee_id": {"$ne": None, "$ne": ""}}},
        {"$group": {"_id": "$employee_id"}},
        {"$count": "unique_users"}
    ]
    unique_users_result = await get_database().leads.aggregate(pipeline).to_list(1)
    unique_users = unique_users_result[0]["unique_users"] if unique_users_result else 0

    # New leads today (IST)
    new_today = await Lead.find({
        **base_query,
        "created_at": {"$gte": today_start_utc, "$lt": today_end_utc}
    }).count()

    # Follow-ups today (IST)
    follow_ups_today = await Lead.find({
        **base_query,
        "follow_up_date": {"$gte": today_start_utc, "$lt": today_end_utc}
    }).count()

    # Leads by status
    status_pipeline = [
        {"$match": base_query},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    status_result = await get_database().leads.aggregate(status_pipeline).to_list(100)
    leads_by_status = {item["_id"]: item["count"] for item in status_result if item["_id"]}

    # Leads by source
    source_pipeline = [
        {"$match": base_query},
        {"$group": {"_id": "$lead_source", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    source_result = await get_database().leads.aggregate(source_pipeline).to_list(100)
    leads_by_source = {item["_id"]: item["count"] for item in source_result if item["_id"]}

    # Leads by service requested (Lead.service_enrolled was renamed to service_requested)
    service_pipeline = [
        {"$match": {**base_query, "service_requested": {"$ne": None, "$nin": ["", None]}}},
        {"$group": {"_id": "$service_requested", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    service_result = await get_database().leads.aggregate(service_pipeline).to_list(100)
    leads_by_service = {item["_id"]: item["count"] for item in service_result if item["_id"]}

    # Daily leads trend — 7-day series for the chart, 30-day series for the
    # percentile band the frontend overlays.
    filled_trends = await _daily_lead_counts(base_query, today_start_utc, 7)
    daily_trends_30d = await _daily_lead_counts(base_query, today_start_utc, 30)

    # Enrollment metrics - use direct MongoDB queries for accurate datetime comparisons
    db = get_database()
    enrollment_base_query = {"is_deleted": False}
    total_enrollments = await db.enrollments.count_documents(enrollment_base_query)

    # New enrollments today (IST)
    new_enrollments_today = await db.enrollments.count_documents({
        **enrollment_base_query,
        "created_at": {"$gte": today_start_utc, "$lt": today_end_utc}
    })

    logger.info(f"Dashboard metrics - UTC range: {today_start_utc} to {today_end_utc}")
    logger.info(f"Dashboard metrics - total_enrollments: {total_enrollments}, new_enrollments_today: {new_enrollments_today}")

    # Enrollments by service partner
    partner_pipeline = [
        {"$match": enrollment_base_query},
        {"$group": {"_id": "$service_partner", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    partner_result = await get_database().enrollments.aggregate(partner_pipeline).to_list(100)
    enrollments_by_partner = {item["_id"]: item["count"] for item in partner_result if item["_id"]}

    # Enrollments by action taken
    action_pipeline = [
        {"$match": enrollment_base_query},
        {"$group": {"_id": "$action_taken", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    action_result = await get_database().enrollments.aggregate(action_pipeline).to_list(100)
    enrollments_by_action = {item["_id"]: item["count"] for item in action_result if item["_id"]}

    # NEW METRICS:
    # 1. Leads enrolled today - leads whose status changed to "Enrolled" today
    # We check for status="Enrolled" AND updated_at is today
    leads_enrolled_today = await Lead.find({
        **base_query,
        "status": "Enrolled",
        "updated_at": {"$gte": today_start_utc, "$lt": today_end_utc}
    }).count()

    # 2. Leads with follow-up today (already calculated as follow_ups_today above)
    # Using the same value

    # 3. Enrollments with follow-up today (next_follow_up_date is today)
    enrollments_followup_today = await db.enrollments.count_documents({
        **enrollment_base_query,
        "next_follow_up_date": {"$gte": today_start_utc, "$lt": today_end_utc}
    })

    logger.info(f"Dashboard metrics - leads_enrolled_today: {leads_enrolled_today}, enrollments_followup_today: {enrollments_followup_today}")

    return {
        "total_leads": total_leads,
        "unique_leads": total_leads,                       # explicit alias (= non-duplicate)
        "duplicate_leads": duplicate_leads,                # flagged duplicates (hidden from lists)
        "total_leads_all": total_leads + duplicate_leads,  # unique + duplicate
        "unique_users": unique_users,
        "new_leads_today": new_today,
        "follow_ups_today": follow_ups_today,
        "leads_by_status": leads_by_status,
        "leads_by_source": leads_by_source,
        "leads_by_service": leads_by_service,
        "daily_trends": filled_trends,
        "daily_trends_30d": daily_trends_30d,
        "total_enrollments": total_enrollments,
        "new_enrollments_today": new_enrollments_today,
        "enrollments_by_partner": enrollments_by_partner,
        "enrollments_by_action": enrollments_by_action,
        # New metrics for stat cards
        "leads_enrolled_today": leads_enrolled_today,
        "leads_followup_today": follow_ups_today,  # Same as follow_ups_today
        "enrollments_followup_today": enrollments_followup_today
    }


@router.get("/admin")
async def get_admin_dashboard(
    current_user: dict = Depends(get_current_admin)
):
    """
    Get admin-specific dashboard metrics
    """
    return await get_dashboard_metrics(current_user)


@router.get("/agent")
async def get_agent_dashboard(
    current_user: dict = Depends(get_current_user)
):
    """
    Get agent-specific dashboard metrics (their assigned leads only)
    """
    today_start_utc, today_end_utc = _ist_today_utc_bounds()

    # Base query - agent's assigned leads only (handles both existing and missing is_deleted field)
    base_query = {
        "$and": [
            {"$or": [{"is_deleted": False}, {"is_deleted": {"$exists": False}}]},
            {"assigned_to": current_user["user_id"]}
        ]
    }

    # Total assigned leads
    total_leads = await Lead.find(base_query).count()

    # New leads today (IST)
    new_today = await Lead.find({
        **base_query,
        "created_at": {"$gte": today_start_utc, "$lt": today_end_utc}
    }).count()

    # Follow-ups today (IST)
    follow_ups_today = await Lead.find({
        **base_query,
        "follow_up_date": {"$gte": today_start_utc, "$lt": today_end_utc}
    }).count()

    # Leads by status
    status_pipeline = [
        {"$match": base_query},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    status_result = await get_database().leads.aggregate(status_pipeline).to_list(100)
    leads_by_status = {item["_id"]: item["count"] for item in status_result if item["_id"]}

    # Leads by source
    source_pipeline = [
        {"$match": base_query},
        {"$group": {"_id": "$lead_source", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    source_result = await get_database().leads.aggregate(source_pipeline).to_list(100)
    leads_by_source = {item["_id"]: item["count"] for item in source_result if item["_id"]}

    # Leads by service requested
    service_pipeline = [
        {"$match": {**base_query, "service_requested": {"$ne": None, "$nin": ["", None]}}},
        {"$group": {"_id": "$service_requested", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    service_result = await get_database().leads.aggregate(service_pipeline).to_list(100)
    leads_by_service = {item["_id"]: item["count"] for item in service_result if item["_id"]}

    # Daily leads trend — 7-day series for the chart, 30-day series for the band.
    filled_trends = await _daily_lead_counts(base_query, today_start_utc, 7)
    daily_trends_30d = await _daily_lead_counts(base_query, today_start_utc, 30)

    # ============ ENROLLMENT STATS FOR AGENT ============
    # Agent's enrollments are determined by hclhc_spoc field matching agent's full name
    agent_name = current_user.get("full_name", "")

    # 1. Total Enrollments (where agent is HCLHC SPOC)
    enrollment_base_query = {
        "is_deleted": False,
        "hclhc_spoc": {"$regex": f"^{agent_name}$", "$options": "i"}
    }
    total_enrollments = await Enrollment.find(enrollment_base_query).count()

    # 2. New Enrollments Assigned Today (IST)
    # Enrollments created today AND assigned to this agent (hclhc_spoc) with assigned_date today
    new_enrollments_today = await Enrollment.find({
        "is_deleted": False,
        "hclhc_spoc": {"$regex": f"^{agent_name}$", "$options": "i"},
        "created_at": {"$gte": today_start_utc, "$lt": today_end_utc},
        "assigned_date": {"$gte": today_start_utc, "$lt": today_end_utc}
    }).count()

    # 3. Total Enrollments Assigned Today (IST)
    enrollments_assigned_today = await Enrollment.find({
        "is_deleted": False,
        "hclhc_spoc": {"$regex": f"^{agent_name}$", "$options": "i"},
        "$or": [
            {"assigned_date": {"$gte": today_start_utc, "$lt": today_end_utc}},
            {"reassigned_date": {"$gte": today_start_utc, "$lt": today_end_utc}}
        ]
    }).count()

    # 4. Enrollments with Follow-up Today (IST)
    enrollments_followup_today = await Enrollment.find({
        "is_deleted": False,
        "hclhc_spoc": {"$regex": f"^{agent_name}$", "$options": "i"},
        "next_follow_up_date": {"$gte": today_start_utc, "$lt": today_end_utc}
    }).count()

    return {
        "total_leads": total_leads,
        "unique_leads": total_leads,
        "duplicate_leads": 0,                 # duplicates are managed at the org level, not per-agent
        "total_leads_all": total_leads,
        "unique_users": 0,
        "new_leads_today": new_today,
        "connected_leads": 0,
        "follow_ups_today": follow_ups_today,
        "leads_by_status": leads_by_status,
        "leads_by_source": leads_by_source,
        "leads_by_service": leads_by_service,
        "daily_trends": filled_trends,
        "daily_trends_30d": daily_trends_30d,
        # Enrollment stats for agent
        "total_enrollments": total_enrollments,
        "new_enrollments_today": new_enrollments_today,
        "enrollments_assigned_today": enrollments_assigned_today,
        "enrollments_followup_today": enrollments_followup_today
    }


@router.get("/summary-data")
async def get_summary_data(
    summary_type: str = "overall",
    agent_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get data for AI summary generation
    """
    # Build query conditions
    conditions = [{"$or": [{"is_deleted": False}, {"is_deleted": {"$exists": False}}]}]

    # Filter by agent if specified
    if agent_id:
        conditions.append({"assigned_to": agent_id})

    # Filter by date range
    if date_from:
        conditions.append({"created_at": {"$gte": datetime.fromisoformat(date_from)}})
    if date_to:
        conditions.append({"created_at": {"$lte": datetime.fromisoformat(date_to)}})

    # Combine all conditions
    base_query = {"$and": conditions} if len(conditions) > 1 else conditions[0]

    # Get leads
    leads = await Lead.find(base_query).to_list(1000)

    # Calculate summary stats
    total = len(leads)
    status_counts = {}
    source_counts = {}
    service_counts = {}

    for lead in leads:
        status = lead.status if lead.status else "Unknown"
        status_counts[status] = status_counts.get(status, 0) + 1

        source = lead.lead_source if lead.lead_source else "Unknown"
        source_counts[source] = source_counts.get(source, 0) + 1

        if lead.service_requested:
            service = lead.service_requested
            service_counts[service] = service_counts.get(service, 0) + 1

    # Get agent name if filtered
    agent_name = None
    if agent_id:
        agent = await User.get(agent_id)
        if agent:
            agent_name = agent.full_name

    return {
        "total_leads": total,
        "status_distribution": status_counts,
        "source_distribution": source_counts,
        "service_distribution": service_counts,
        "agent_name": agent_name,
        "date_range": {"from": date_from, "to": date_to}
    }


@router.post("/summaries")
async def save_summary(
    request: SummaryCreateRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Save a generated summary
    """
    summary = Summary(
        summary_type=SummaryType(request.summary_type),
        content=request.content,
        agent_id=request.agent_id,
        agent_name=request.agent_name,
        summary_date=request.summary_date,
        total_leads=request.total_leads,
        status_distribution=request.status_distribution,
        source_distribution=request.source_distribution,
        service_distribution=request.service_distribution,
        activity_metrics=request.activity_metrics,
        lead_details=request.lead_details,
        created_by=current_user["user_id"],
        created_by_name=current_user["full_name"]
    )

    await summary.insert()

    logger.info(f"Summary saved by {current_user['email']}")

    return {
        "id": str(summary.id),
        "message": "Summary saved successfully"
    }


@router.get("/summaries")
async def get_summaries(
    limit: int = 20,
    agent_id: Optional[str] = None,
    summary_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get stored summaries, sorted by latest date.
    Agents can only see their own summaries.
    Admins can see all summaries or filter by agent_id.
    """
    is_admin = current_user.get("role") in ["admin", "super_admin"]

    # Build query
    query = {}

    # Access control: agents can only see their own summaries
    if not is_admin:
        query["agent_id"] = current_user["user_id"]
    elif agent_id:
        # Admin filtering by specific agent
        query["agent_id"] = agent_id

    # Optional filter by summary type
    if summary_type:
        query["summary_type"] = SummaryType(summary_type)

    summaries = await Summary.find(query).sort("-created_at").limit(limit).to_list()

    return {
        "summaries": [
            {
                "id": str(s.id),
                "summary_type": s.summary_type.value,
                "content": s.content,
                "agent_id": s.agent_id,
                "agent_name": s.agent_name,
                "summary_date": s.summary_date,
                "total_leads": s.total_leads,
                "status_distribution": s.status_distribution,
                "source_distribution": s.source_distribution,
                "service_distribution": s.service_distribution,
                "activity_metrics": s.activity_metrics,
                "lead_details": s.lead_details,
                "created_at": s.created_at,
                "created_by_name": s.created_by_name
            }
            for s in summaries
        ]
    }


@router.delete("/summaries/{summary_id}")
async def delete_summary(
    summary_id: str,
    current_user: dict = Depends(get_current_admin)
):
    """
    Delete a summary (Admin only)
    """
    summary = await Summary.get(ObjectId(summary_id))
    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found")

    await summary.delete()

    return {"message": "Summary deleted successfully"}


@router.get("/leads-by-status")
async def get_leads_by_status(
    current_user: dict = Depends(get_current_user)
):
    """Get leads grouped by status for charts"""
    base_query = {"$or": [{"is_deleted": False}, {"is_deleted": {"$exists": False}}]}

    status_pipeline = [
        {"$match": base_query},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    status_result = await get_database().leads.aggregate(status_pipeline).to_list(100)

    return {
        "data": [
            {"status": item["_id"] or "Unknown", "count": item["count"]}
            for item in status_result
        ]
    }


@router.get("/leads-by-source")
async def get_leads_by_source(
    current_user: dict = Depends(get_current_user)
):
    """Get leads grouped by source for charts"""
    base_query = {"$or": [{"is_deleted": False}, {"is_deleted": {"$exists": False}}]}

    source_pipeline = [
        {"$match": base_query},
        {"$group": {"_id": "$lead_source", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    source_result = await get_database().leads.aggregate(source_pipeline).to_list(100)

    return {
        "data": [
            {"source": item["_id"] or "Unknown", "count": item["count"]}
            for item in source_result
        ]
    }


@router.get("/agent-activity")
async def get_agent_activity(
    agent_id: Optional[str] = None,
    date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get comprehensive agent activity for a specific date.
    Includes leads and enrollments: assignments, actions, and follow-ups.

    Returns:
    - leads_assignment: new leads, reassigned in/out
    - enrollments_assignment: new enrollments, reassigned in/out
    - followups: leads and enrollments with follow-ups due
    - lead_actions: all actions from audit_logs
    - enrollment_actions: all actions from enrollment_audit_logs
    - summary: aggregate stats for dashboard cards
    """
    # Default to current user's ID if not provided
    if not agent_id:
        agent_id = current_user["user_id"]

    # Default to today if date not provided
    if not date:
        date = datetime.utcnow().strftime("%Y-%m-%d")

    # Access control: agents can only see their own data
    is_admin = current_user.get("role") in ["admin", "super_admin"]
    if not is_admin and current_user["user_id"] != agent_id:
        raise HTTPException(
            status_code=403,
            detail="You can only view your own activity"
        )

    # Parse date - use UTC boundaries (timestamps in DB are UTC)
    try:
        target_date = datetime.strptime(date, "%Y-%m-%d")
        date_start = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
        date_end = date_start + timedelta(days=1)
        logger.info(f"Agent activity query: {date} -> UTC range {date_start} to {date_end}")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    # Get agent info
    agent = await User.get(ObjectId(agent_id))
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent_name = agent.full_name
    db = get_database()

    logger.info(f"=== AGENT ACTIVITY DEBUG ===")
    logger.info(f"Agent ID: {agent_id}, Agent Name: {agent_name}")
    logger.info(f"Date: {date}, UTC Range: {date_start} to {date_end}")

    # =============================================
    # SECTION 1: LEADS ASSIGNMENT
    # =============================================

    # New leads: created on this date AND assigned to agent
    new_leads_query = {
        "$or": [{"is_deleted": False}, {"is_deleted": {"$exists": False}}],
        "assigned_to": agent_id,
        "created_at": {"$gte": date_start, "$lt": date_end}
    }
    logger.info(f"New leads query: {new_leads_query}")
    new_leads = await Lead.find(new_leads_query).to_list()
    logger.info(f"New leads found: {len(new_leads)}")
    new_leads_list = [
        {
            "lead_id": lead.lead_id,
            "name": lead.name or "Unknown",
            "phone": lead.phone_number,
            "status": lead.status if lead.status else "New",
            "lead_source": lead.lead_source if lead.lead_source else None,
            "created_at": lead.created_at.isoformat() if lead.created_at else None
        }
        for lead in new_leads
    ]

    # Reassigned TO this agent (from audit logs)
    reassigned_to_agent_query = {
        "timestamp": {"$gte": date_start, "$lt": date_end},
        "changes": {
            "$elemMatch": {
                "field": {"$in": ["assigned_to", "reassign_to"]},
                "new_value": agent_id
            }
        }
    }
    reassigned_to_logs = await AuditLog.find(reassigned_to_agent_query).to_list()
    logger.info(f"Reassigned TO agent logs found: {len(reassigned_to_logs)}")

    # Get unique lead IDs (avoid duplicates)
    reassigned_to_lead_ids = set()
    reassigned_to_agent_list = []
    for log in reassigned_to_logs:
        if log.lead_id in reassigned_to_lead_ids:
            continue
        reassigned_to_lead_ids.add(log.lead_id)

        # Get lead info
        lead = await Lead.find_one({"lead_id": log.lead_id})
        lead_name = lead.name if lead else log.lead_id
        lead_status = lead.status if lead and lead.status else "N/A"

        reassigned_to_agent_list.append({
            "lead_id": log.lead_id,
            "name": lead_name or log.lead_id,
            "status": lead_status,
            "reassigned_at": log.timestamp.isoformat() if log.timestamp else None
        })

    # Reassigned FROM this agent (audit logs where agent's ID was old value)
    reassigned_from_agent_query = {
        "timestamp": {"$gte": date_start, "$lt": date_end},
        "changes": {
            "$elemMatch": {
                "field": {"$in": ["assigned_to", "reassign_to"]},
                "old_value": agent_id
            }
        }
    }
    reassigned_from_logs = await AuditLog.find(reassigned_from_agent_query).to_list()
    logger.info(f"Reassigned FROM agent logs found: {len(reassigned_from_logs)}")

    reassigned_from_lead_ids = set()
    reassigned_from_agent_list = []
    for log in reassigned_from_logs:
        if log.lead_id in reassigned_from_lead_ids:
            continue
        reassigned_from_lead_ids.add(log.lead_id)

        lead = await Lead.find_one({"lead_id": log.lead_id})
        lead_name = lead.name if lead else log.lead_id
        lead_status = lead.status if lead and lead.status else "N/A"

        reassigned_from_agent_list.append({
            "lead_id": log.lead_id,
            "name": lead_name or log.lead_id,
            "status": lead_status,
            "reassigned_at": log.timestamp.isoformat() if log.timestamp else None
        })

    # =============================================
    # SECTION 2: ENROLLMENTS ASSIGNMENT
    # =============================================

    # New enrollments: created on this date AND hclhc_spoc = agent name
    new_enrollments_query = {
        "is_deleted": False,
        "hclhc_spoc": {"$regex": f"^{agent_name}$", "$options": "i"},
        "created_at": {"$gte": date_start, "$lt": date_end}
    }
    new_enrollments = await Enrollment.find(new_enrollments_query).to_list()
    new_enrollments_list = [
        {
            "enrollment_id": e.enrollment_id,
            "name": e.name or e.subscriber_name or "Unknown",
            "phone": e.phone_number,
            "connect_status": e.connect_status.value if e.connect_status else None,
            "service_enrolled": e.service_enrolled,
            "created_at": e.created_at.isoformat() if e.created_at else None
        }
        for e in new_enrollments
    ]

    # Reassigned TO agent (enrollment audit logs - hclhc_spoc changed to this agent's name)
    enr_reassigned_to_query = {
        "timestamp": {"$gte": date_start, "$lt": date_end},
        "changes": {
            "$elemMatch": {
                "field": {"$in": ["hclhc_spoc", "assigned_to"]},
                "new_value": {"$regex": f"^{agent_name}$", "$options": "i"}
            }
        }
    }
    enr_reassigned_to_logs = await EnrollmentAuditLog.find(enr_reassigned_to_query).to_list()
    logger.info(f"Enrollment reassigned TO agent logs found: {len(enr_reassigned_to_logs)}")

    # Get unique enrollment IDs
    enr_reassigned_to_ids = set()
    enr_reassigned_to_list = []
    for log in enr_reassigned_to_logs:
        if log.enrollment_id in enr_reassigned_to_ids:
            continue
        enr_reassigned_to_ids.add(log.enrollment_id)

        enrollment = await Enrollment.find_one({"enrollment_id": log.enrollment_id})
        enr_name = (enrollment.name or enrollment.subscriber_name) if enrollment else log.enrollment_id

        enr_reassigned_to_list.append({
            "enrollment_id": log.enrollment_id,
            "name": enr_name or log.enrollment_id,
            "connect_status": enrollment.connect_status.value if enrollment and enrollment.connect_status else None,
            "reassigned_at": log.timestamp.isoformat() if log.timestamp else None
        })

    # Reassigned FROM agent (enrollment audit logs)
    enr_reassigned_from_query = {
        "timestamp": {"$gte": date_start, "$lt": date_end},
        "changes": {
            "$elemMatch": {
                "field": {"$in": ["hclhc_spoc", "assigned_to"]},
                "old_value": {"$regex": f"^{agent_name}$", "$options": "i"}
            }
        }
    }
    enr_reassigned_from_logs = await EnrollmentAuditLog.find(enr_reassigned_from_query).to_list()
    logger.info(f"Enrollment reassigned FROM agent logs found: {len(enr_reassigned_from_logs)}")

    enr_reassigned_from_ids = set()
    enr_reassigned_from_list = []
    for log in enr_reassigned_from_logs:
        if log.enrollment_id in enr_reassigned_from_ids:
            continue
        enr_reassigned_from_ids.add(log.enrollment_id)

        enrollment = await Enrollment.find_one({"enrollment_id": log.enrollment_id})
        enr_name = (enrollment.name or enrollment.subscriber_name) if enrollment else log.enrollment_id

        enr_reassigned_from_list.append({
            "enrollment_id": log.enrollment_id,
            "name": enr_name or log.enrollment_id,
            "connect_status": enrollment.connect_status.value if enrollment and enrollment.connect_status else None,
            "reassigned_at": log.timestamp.isoformat() if log.timestamp else None
        })

    # =============================================
    # SECTION 3: FOLLOW-UPS DUE
    # =============================================

    # Lead follow-ups due on this date
    lead_followups_query = {
        "$or": [{"is_deleted": False}, {"is_deleted": {"$exists": False}}],
        "assigned_to": agent_id,
        "follow_up_date": {"$gte": date_start, "$lt": date_end}
    }
    leads_with_followups = await Lead.find(lead_followups_query).to_list()
    lead_followups_list = []
    for lead in leads_with_followups:
        is_overdue = False
        if lead.follow_up_date:
            # Check if follow-up time has passed
            now = datetime.utcnow()
            if lead.follow_up_date < now:
                is_overdue = True

        lead_followups_list.append({
            "lead_id": lead.lead_id,
            "name": lead.name or "Unknown",
            "status": lead.status if lead.status else "Unknown",
            "follow_up_time": lead.follow_up_date.isoformat() if lead.follow_up_date else None,
            "is_overdue": is_overdue
        })

    # Enrollment follow-ups due on this date
    enr_followups_query = {
        "is_deleted": False,
        "hclhc_spoc": {"$regex": f"^{agent_name}$", "$options": "i"},
        "next_follow_up_date": {"$gte": date_start, "$lt": date_end}
    }
    enrollments_with_followups = await Enrollment.find(enr_followups_query).to_list()
    enr_followups_list = [
        {
            "enrollment_id": e.enrollment_id,
            "name": e.name or e.subscriber_name or "Unknown",
            "connect_status": e.connect_status.value if e.connect_status else None,
            "next_follow_up_date": e.next_follow_up_date.isoformat() if e.next_follow_up_date else None
        }
        for e in enrollments_with_followups
    ]

    # =============================================
    # SECTION 4: LEAD ACTIONS (from audit_logs)
    # =============================================

    lead_audit_query = {
        "user_id": agent_id,
        "timestamp": {"$gte": date_start, "$lt": date_end}
    }
    logger.info(f"Lead audit query: {lead_audit_query}")
    lead_audit_logs = await AuditLog.find(lead_audit_query).sort("timestamp").to_list()
    logger.info(f"Lead audit logs found: {len(lead_audit_logs)}")

    # Categorize actions
    lead_action_counts = {
        "status_changes": 0,
        "comments_added": 0,
        "calls_logged": 0,
        "field_updates": 0
    }

    lead_action_details = []
    unique_leads_worked = set()

    for log in lead_audit_logs:
        unique_leads_worked.add(log.lead_id)

        # Get lead name
        lead = await Lead.find_one({"lead_id": log.lead_id})
        lead_name = lead.name if lead else "Unknown"

        # Determine action type
        action_type = log.action.value if log.action else "updated"

        # Count by type
        if log.action == AuditAction.STATUS_CHANGED:
            lead_action_counts["status_changes"] += 1
        elif log.action == AuditAction.CALL_ADDED:
            lead_action_counts["calls_logged"] += 1
        else:
            # Check changes for comments
            has_comment = any(c.get("field") == "comments" for c in log.changes)
            if has_comment:
                lead_action_counts["comments_added"] += 1
            else:
                lead_action_counts["field_updates"] += 1

        lead_action_details.append({
            "lead_id": log.lead_id,
            "lead_name": lead_name,
            "action_type": action_type,
            "changes": log.changes,
            "timestamp": log.timestamp.isoformat() if log.timestamp else None
        })

    # =============================================
    # SECTION 5: ENROLLMENT ACTIONS (from enrollment_audit_logs)
    # =============================================

    # Query by user_id or user_name for enrollment audit logs
    enr_audit_query = {
        "$or": [
            {"user_id": agent_id},
            {"user_name": {"$regex": f"^{agent_name}$", "$options": "i"}}
        ],
        "timestamp": {"$gte": date_start, "$lt": date_end}
    }
    logger.info(f"Enrollment audit query: {enr_audit_query}")
    enr_audit_logs = await EnrollmentAuditLog.find(enr_audit_query).sort("timestamp").to_list()
    logger.info(f"Enrollment audit logs found: {len(enr_audit_logs)}")

    enr_action_counts = {
        "status_changes": 0,
        "follow_ups_added": 0,
        "field_updates": 0
    }

    enr_action_details = []
    unique_enrollments_worked = set()

    for log in enr_audit_logs:
        unique_enrollments_worked.add(log.enrollment_id)

        # Get enrollment name
        enrollment = await Enrollment.find_one({"enrollment_id": log.enrollment_id})
        enr_name = enrollment.name or enrollment.subscriber_name if enrollment else "Unknown"

        action_type = log.action.value if log.action else "updated"

        # Count by type
        if log.action == EnrollmentAuditAction.STATUS_CHANGED:
            enr_action_counts["status_changes"] += 1
        elif log.action == EnrollmentAuditAction.FOLLOW_UP_ADDED:
            enr_action_counts["follow_ups_added"] += 1
        else:
            enr_action_counts["field_updates"] += 1

        enr_action_details.append({
            "enrollment_id": log.enrollment_id,
            "enrollment_name": enr_name,
            "action_type": action_type,
            "changes": log.changes,
            "timestamp": log.timestamp.isoformat() if log.timestamp else None
        })

    # =============================================
    # SECTION 6: TOTAL PORTFOLIO (all leads/enrollments with agent)
    # =============================================

    # Total leads currently assigned to agent (no date filter - their portfolio)
    total_leads_with_agent = await Lead.find({
        "$or": [{"is_deleted": False}, {"is_deleted": {"$exists": False}}],
        "assigned_to": agent_id
    }).count()
    logger.info(f"Total leads with agent: {total_leads_with_agent}")

    # Total enrollments with agent as HCLHC SPOC (no date filter)
    total_enrollments_with_agent = await Enrollment.find({
        "is_deleted": False,
        "hclhc_spoc": {"$regex": f"^{agent_name}$", "$options": "i"}
    }).count()
    logger.info(f"Total enrollments with agent: {total_enrollments_with_agent}")

    # =============================================
    # SECTION 7: SUMMARY STATS
    # =============================================

    summary = {
        # Portfolio totals (all leads/enrollments with this agent)
        "total_leads_with_agent": total_leads_with_agent,
        "total_enrollments_with_agent": total_enrollments_with_agent,
        # Activity on selected date
        "total_leads_worked": len(unique_leads_worked),
        "total_enrollments_worked": len(unique_enrollments_worked),
        "new_leads_assigned": len(new_leads_list),
        "leads_reassigned_in": len(reassigned_to_agent_list),
        "leads_reassigned_out": len(reassigned_from_agent_list),
        "new_enrollments_assigned": len(new_enrollments_list),
        "enrollments_reassigned_in": len(enr_reassigned_to_list),
        "enrollments_reassigned_out": len(enr_reassigned_from_list),
        "total_lead_actions": len(lead_audit_logs),
        "total_enrollment_actions": len(enr_audit_logs),
        "followups_due_leads": len(lead_followups_list),
        "followups_due_enrollments": len(enr_followups_list)
    }

    logger.info(f"=== AGENT ACTIVITY SUMMARY ===")
    logger.info(f"Summary: {summary}")

    # Build response
    return {
        "agent_id": agent_id,
        "agent_name": agent_name,
        "date": date,

        "leads_assignment": {
            "new_leads": new_leads_list,
            "reassigned_to_agent": reassigned_to_agent_list,
            "reassigned_from_agent": reassigned_from_agent_list
        },

        "enrollments_assignment": {
            "new_enrollments": new_enrollments_list,
            "reassigned_to_agent": enr_reassigned_to_list,
            "reassigned_from_agent": enr_reassigned_from_list
        },

        "followups": {
            "leads": lead_followups_list,
            "enrollments": enr_followups_list
        },

        "lead_actions": {
            "total_actions": len(lead_audit_logs),
            "by_type": lead_action_counts,
            "details": lead_action_details
        },

        "enrollment_actions": {
            "total_actions": len(enr_audit_logs),
            "by_type": enr_action_counts,
            "details": enr_action_details
        },

        "summary": summary
    }


@router.get("/my-tasks")
async def get_my_tasks(current_user: dict = Depends(get_current_user)):
    """
    Unified "My Tasks" worklist for the current user (any role sees their own):
    the ONE next thing to do per person — an earliest-due care step (where they
    are the enrollment's HCLHC SPOC) or a due lead follow-up (assigned/reassigned
    to them). Window = overdue OR due within the next 7 days. No far-future
    recurring steps. Additive, read-only.
    """
    uid = current_user["user_id"]
    user_name = (current_user.get("full_name") or "").strip()
    today = date.today()
    cutoff = today + timedelta(days=7)

    def _due_info(dt):
        """Return (date, is_overdue, in_window) for a due datetime."""
        if not isinstance(dt, datetime):
            return None, False, False
        d = dt.date()
        return d, (d < today), (d <= cutoff)

    items = []

    # --- CARE STEPS: earliest pending step on the user's SPOC enrollments ---
    if user_name:
        spoc_enrollments = await Enrollment.find({
            "is_deleted": False,
            "hclhc_spoc": {"$regex": f"^{re.escape(user_name)}$", "$options": "i"},
            "journey_status": "active",
            "do_not_contact": {"$ne": True},
            "journey": {"$exists": True, "$ne": []},
        }).to_list()
        for enr in spoc_enrollments:
            journey = enr.journey or []
            pending = [s for s in journey if s.get("status") == "pending" and isinstance(s.get("planned_date"), datetime)]
            if not pending:
                continue
            nxt = min(pending, key=lambda s: s["planned_date"])
            due_date, is_overdue, in_window = _due_info(nxt.get("planned_date"))
            if not in_window:
                continue  # earliest pending is far-future -> not a task yet
            done = sum(1 for s in journey if s.get("status") == "done")
            items.append({
                "task_type": "care_step",
                "person_name": enr.subscriber_name or enr.name,
                "phone_number": enr.phone_number,
                "record_id": enr.enrollment_id,
                "enrollment_id": enr.enrollment_id,
                "lead_id": None,
                "step_id": nxt.get("step_id"),
                "action_name": nxt.get("name"),
                "step_type": nxt.get("step_type"),
                "service": enr.service_enrolled,
                "due_date": nxt.get("planned_date"),
                "is_overdue": is_overdue,
                "done": done,
                "total": len(journey),
            })

    # --- LEAD FOLLOW-UPS: due follow-ups on the user's assigned/reassigned leads ---
    lead_query = {
        "is_deleted": False,
        "duplicate_status": {"$in": [None, "not_duplicate"]},
        "status": {"$ne": LeadStatus.ENROLLED.value},   # enrolled -> counted as a care step
        "follow_up_date": {"$ne": None},
        "$or": [{"assigned_to": uid}, {"reassign_to": uid}],
    }
    lead_tasks = await Lead.find(lead_query).to_list()
    for lead in lead_tasks:
        due_date, is_overdue, in_window = _due_info(lead.follow_up_date)
        if not in_window:
            continue
        items.append({
            "task_type": "lead_follow_up",
            "person_name": lead.name,
            "phone_number": lead.phone_number,
            "record_id": lead.lead_id,
            "enrollment_id": None,
            "lead_id": lead.lead_id,
            "step_id": None,
            "action_name": "Follow-up",
            "step_type": "Call",
            "service": lead.service_requested,
            "status": lead.status,
            "due_date": lead.follow_up_date,
            "is_overdue": is_overdue,
            "done": None,
            "total": None,
        })

    items.sort(key=lambda x: (x["due_date"] or datetime.max))
    overdue = sum(1 for i in items if i["is_overdue"])
    due_today = sum(1 for i in items if isinstance(i["due_date"], datetime) and i["due_date"].date() == today)
    upcoming = len(items) - overdue - due_today
    return {
        "items": items,
        "total": len(items),
        "counts": {"overdue": overdue, "due_today": due_today, "upcoming": upcoming},
    }
