"""
Dashboard Routes - Metrics and Analytics
Updated with enrollment metrics
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional, List
from app.models.lead import Lead, LeadStatus
from app.models.user import User
from app.models.summary import Summary, SummaryType
from app.models.audit_log import AuditLog, AuditAction
from app.models.enrollment import Enrollment
from app.middleware.auth_middleware import get_current_user, get_current_admin
from app.database import get_database
from bson import ObjectId
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


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
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    # Base query - exclude deleted leads (handles both existing and missing is_deleted field)
    base_query = {"$or": [{"is_deleted": False}, {"is_deleted": {"$exists": False}}]}

    # Total leads
    total_leads = await Lead.find(base_query).count()

    # Unique users (by employee_id)
    pipeline = [
        {"$match": {"is_deleted": False, "employee_id": {"$ne": None, "$ne": ""}}},
        {"$group": {"_id": "$employee_id"}},
        {"$count": "unique_users"}
    ]
    unique_users_result = await get_database().leads.aggregate(pipeline).to_list(1)
    unique_users = unique_users_result[0]["unique_users"] if unique_users_result else 0

    # New leads today
    new_today = await Lead.find({
        **base_query,
        "created_at": {"$gte": today}
    }).count()

    # Follow-ups today
    tomorrow = today + timedelta(days=1)
    follow_ups_today = await Lead.find({
        **base_query,
        "follow_up_date": {"$gte": today, "$lt": tomorrow}
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

    # Leads by service enrolled
    service_pipeline = [
        {"$match": {**base_query, "service_enrolled": {"$ne": None}}},
        {"$group": {"_id": "$service_enrolled", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    service_result = await get_database().leads.aggregate(service_pipeline).to_list(100)
    leads_by_service = {item["_id"]: item["count"] for item in service_result if item["_id"]}

    # Daily leads trend (last 7 days)
    seven_days_ago = today - timedelta(days=6)
    daily_pipeline = [
        {"$match": {**base_query, "created_at": {"$gte": seven_days_ago}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id": 1}}
    ]
    daily_result = await get_database().leads.aggregate(daily_pipeline).to_list(100)
    daily_trends = [{"date": item["_id"], "count": item["count"]} for item in daily_result]

    # Fill missing days
    date_counts = {item["date"]: item["count"] for item in daily_trends}
    filled_trends = []
    for i in range(7):
        date = (seven_days_ago + timedelta(days=i)).strftime("%Y-%m-%d")
        filled_trends.append({"date": date, "count": date_counts.get(date, 0)})

    # Enrollment metrics
    enrollment_base_query = {"is_deleted": False}
    total_enrollments = await Enrollment.find(enrollment_base_query).count()

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

    return {
        "total_leads": total_leads,
        "unique_users": unique_users,
        "new_leads_today": new_today,
        "follow_ups_today": follow_ups_today,
        "leads_by_status": leads_by_status,
        "leads_by_source": leads_by_source,
        "leads_by_service": leads_by_service,
        "daily_trends": filled_trends,
        "total_enrollments": total_enrollments,
        "enrollments_by_partner": enrollments_by_partner,
        "enrollments_by_action": enrollments_by_action
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
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    # Base query - agent's assigned leads only (handles both existing and missing is_deleted field)
    base_query = {
        "$and": [
            {"$or": [{"is_deleted": False}, {"is_deleted": {"$exists": False}}]},
            {"assigned_to": current_user["user_id"]}
        ]
    }

    # Total assigned leads
    total_leads = await Lead.find(base_query).count()

    # New leads today
    new_today = await Lead.find({
        **base_query,
        "created_at": {"$gte": today}
    }).count()

    # Follow-ups today
    tomorrow = today + timedelta(days=1)
    follow_ups_today = await Lead.find({
        **base_query,
        "follow_up_date": {"$gte": today, "$lt": tomorrow}
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

    # Leads by service enrolled
    service_pipeline = [
        {"$match": {**base_query, "service_enrolled": {"$ne": None}}},
        {"$group": {"_id": "$service_enrolled", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    service_result = await get_database().leads.aggregate(service_pipeline).to_list(100)
    leads_by_service = {item["_id"]: item["count"] for item in service_result if item["_id"]}

    # Daily leads trend (last 7 days) - for agent's assigned leads
    seven_days_ago = today - timedelta(days=6)
    daily_pipeline = [
        {"$match": {**base_query, "created_at": {"$gte": seven_days_ago}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id": 1}}
    ]
    daily_result = await get_database().leads.aggregate(daily_pipeline).to_list(100)
    daily_trends = [{"date": item["_id"], "count": item["count"]} for item in daily_result]

    # Fill missing days
    date_counts = {item["date"]: item["count"] for item in daily_trends}
    filled_trends = []
    for i in range(7):
        date = (seven_days_ago + timedelta(days=i)).strftime("%Y-%m-%d")
        filled_trends.append({"date": date, "count": date_counts.get(date, 0)})

    return {
        "total_leads": total_leads,
        "unique_users": 0,
        "new_leads_today": new_today,
        "connected_leads": 0,
        "follow_ups_today": follow_ups_today,
        "leads_by_status": leads_by_status,
        "leads_by_source": leads_by_source,
        "leads_by_service": leads_by_service,
        "daily_trends": filled_trends
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
        status = lead.status.value if lead.status else "Unknown"
        status_counts[status] = status_counts.get(status, 0) + 1

        source = lead.lead_source.value if lead.lead_source else "Unknown"
        source_counts[source] = source_counts.get(source, 0) + 1

        if lead.service_enrolled:
            service = lead.service_enrolled.value
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


@router.get("/agent-activity")
async def get_agent_activity(
    agent_id: str,
    date: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get detailed agent activity for a specific date.
    Agents can only view their own activity.
    Admins can view any agent's activity.
    """
    # Access control: agents can only see their own data
    is_admin = current_user.get("role") in ["admin", "super_admin"]
    if not is_admin and current_user["user_id"] != agent_id:
        raise HTTPException(
            status_code=403,
            detail="You can only view your own activity"
        )

    # Parse date
    try:
        target_date = datetime.strptime(date, "%Y-%m-%d")
        date_start = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
        date_end = date_start + timedelta(days=1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    # Get agent info
    agent = await User.get(ObjectId(agent_id))
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Get all leads assigned to this agent
    leads_query = {
        "$and": [
            {"$or": [{"is_deleted": False}, {"is_deleted": {"$exists": False}}]},
            {"assigned_to": agent_id}
        ]
    }
    assigned_leads = await Lead.find(leads_query).to_list()

    # Initialize response data
    leads_assigned_list = []
    calls_made_list = []
    followups_due_list = []
    followups_overdue_list = []

    total_calls_today = 0
    lead_ids = []

    for lead in assigned_leads:
        lead_ids.append(lead.lead_id)

        # Add to leads assigned list
        leads_assigned_list.append({
            "lead_id": lead.lead_id,
            "name": lead.name,
            "status": lead.status.value if lead.status else "Unknown",
            "phone_number": lead.phone_number,
            "assigned_date": lead.created_at.strftime("%Y-%m-%d") if lead.created_at else None
        })

        # Check calls made today
        if lead.calls:
            for call in lead.calls:
                call_dt = call.get("date_time")
                if call_dt:
                    # Parse call datetime
                    if isinstance(call_dt, str):
                        try:
                            call_datetime = datetime.fromisoformat(call_dt.replace("Z", "+00:00"))
                        except:
                            continue
                    elif isinstance(call_dt, datetime):
                        call_datetime = call_dt
                    else:
                        continue

                    # Check if call is on target date
                    if date_start <= call_datetime < date_end:
                        total_calls_today += 1
                        calls_made_list.append({
                            "lead_id": lead.lead_id,
                            "name": lead.name,
                            "call_number": call.get("call_number", 0),
                            "call_time": call_datetime.strftime("%H:%M"),
                            "summary": call.get("summary", "")[:100] if call.get("summary") else ""
                        })

        # Check follow-ups
        if lead.follow_up_date:
            follow_up_dt = lead.follow_up_date
            if isinstance(follow_up_dt, str):
                try:
                    follow_up_dt = datetime.fromisoformat(follow_up_dt.replace("Z", "+00:00"))
                except:
                    follow_up_dt = None

            if follow_up_dt:
                follow_up_date_only = follow_up_dt.replace(hour=0, minute=0, second=0, microsecond=0)

                # Due today
                if follow_up_date_only == date_start:
                    followups_due_list.append({
                        "lead_id": lead.lead_id,
                        "name": lead.name,
                        "follow_up_date": lead.follow_up_date.strftime("%Y-%m-%d %H:%M") if isinstance(lead.follow_up_date, datetime) else str(lead.follow_up_date),
                        "status": lead.status.value if lead.status else "Unknown"
                    })
                # Overdue
                elif follow_up_date_only < date_start:
                    # Check if lead is not in a closed status
                    closed_statuses = ["Lead Closed - No Response", "Not Interested"]
                    if lead.status and lead.status.value not in closed_statuses:
                        days_overdue = (date_start - follow_up_date_only).days
                        followups_overdue_list.append({
                            "lead_id": lead.lead_id,
                            "name": lead.name,
                            "follow_up_date": lead.follow_up_date.strftime("%Y-%m-%d") if isinstance(lead.follow_up_date, datetime) else str(lead.follow_up_date),
                            "days_overdue": days_overdue,
                            "status": lead.status.value if lead.status else "Unknown"
                        })

    # Get audit logs for status changes, comments, and reassignments by this agent on this date
    audit_query = {
        "user_id": agent_id,
        "timestamp": {"$gte": date_start, "$lt": date_end}
    }
    audit_logs = await AuditLog.find(audit_query).to_list()

    status_changes_list = []
    comments_added_list = []
    reassignments_list = []

    for log in audit_logs:
        lead_name = "Unknown"
        # Try to get lead name from assigned leads
        for lead in assigned_leads:
            if lead.lead_id == log.lead_id:
                lead_name = lead.name
                break

        if log.action == AuditAction.STATUS_CHANGED:
            for change in log.changes:
                if change.get("field") == "status":
                    status_changes_list.append({
                        "lead_id": log.lead_id,
                        "name": lead_name,
                        "old_status": change.get("old_value", ""),
                        "new_status": change.get("new_value", ""),
                        "changed_at": log.timestamp.strftime("%H:%M")
                    })

        # Check for comments in changes
        for change in log.changes:
            if change.get("field") == "comments":
                comments_added_list.append({
                    "lead_id": log.lead_id,
                    "name": lead_name,
                    "comment_preview": str(change.get("new_value", ""))[:100],
                    "added_at": log.timestamp.strftime("%H:%M")
                })

        # Check for reassignments
        if log.action == AuditAction.ASSIGNED or log.action == AuditAction.UPDATED:
            for change in log.changes:
                if change.get("field") in ["reassign_to", "reassign_to_name"]:
                    reassignments_list.append({
                        "lead_id": log.lead_id,
                        "name": lead_name,
                        "reassigned_to": change.get("new_value", ""),
                        "reassigned_at": log.timestamp.strftime("%H:%M")
                    })

    # Build response
    return {
        "agent_id": agent_id,
        "agent_name": agent.full_name,
        "date": date,
        "summary": {
            "total_leads_assigned": len(assigned_leads),
            "calls_made_today": total_calls_today,
            "followups_due_today": len(followups_due_list),
            "followups_overdue": len(followups_overdue_list),
            "status_changes_today": len(status_changes_list),
            "comments_added_today": len(comments_added_list),
            "reassignments_made": len(reassignments_list)
        },
        "lead_details": {
            "leads_assigned": leads_assigned_list,
            "calls_made": calls_made_list,
            "followups_due": followups_due_list,
            "followups_overdue": followups_overdue_list,
            "status_changes": status_changes_list,
            "comments_added": comments_added_list,
            "reassignments": reassignments_list
        }
    }
