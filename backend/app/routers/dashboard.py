"""
Dashboard Routes - Metrics and Analytics
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional, List
from app.models.lead import Lead, LeadStatus
from app.models.user import User
from app.models.summary import Summary, SummaryType
from app.middleware.auth_middleware import get_current_user, get_current_admin
from app.database import get_database
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

    return {
        "total_leads": total_leads,
        "unique_users": unique_users,
        "new_leads_today": new_today,
        "follow_ups_today": follow_ups_today,
        "leads_by_status": leads_by_status,
        "leads_by_source": leads_by_source,
        "leads_by_service": leads_by_service,
        "daily_trends": filled_trends
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

    return {
        "total_leads": total_leads,
        "unique_users": 0,
        "new_leads_today": new_today,
        "connected_leads": 0,
        "follow_ups_today": follow_ups_today,
        "leads_by_status": leads_by_status,
        "leads_by_source": {},
        "leads_by_service": {},
        "daily_trends": []
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
    current_user: dict = Depends(get_current_user)
):
    """
    Get stored summaries, sorted by latest date
    """
    summaries = await Summary.find().sort("-created_at").limit(limit).to_list()

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
    from bson import ObjectId

    summary = await Summary.get(ObjectId(summary_id))
    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found")

    await summary.delete()

    return {"message": "Summary deleted successfully"}
