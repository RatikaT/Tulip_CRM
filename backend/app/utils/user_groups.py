"""
"User Level" view: group a filtered list of leads / enrollments by customer
(UHID) on the server, so the counts and groups cover every matching record -
not just the page of rows the browser happens to have loaded.
"""
from datetime import datetime
from typing import Any, Dict, List, Tuple

# UHID with stray spaces trimmed; blank / missing -> "" (shown as "Unknown")
_KEY = {"$trim": {"input": {"$ifNull": ["$uhid", ""]}}}


async def group_by_uhid(coll, query: Dict[str, Any], page: int, per_page: int,
                        today: Tuple[datetime, datetime]) -> Dict[str, Any]:
    """Returns {total_users, users_created_today, total_records, total_groups,
    keys (this page's UHIDs, biggest groups first)}."""
    start, end = today
    pipeline = [
        {"$match": query},
        {"$group": {
            "_id": _KEY,
            "count": {"$sum": 1},
            "today": {"$max": {"$cond": [{"$and": [{"$gte": ["$created_at", start]},
                                                   {"$lt": ["$created_at", end]}]}, 1, 0]}},
            "last": {"$max": "$created_at"},
        }},
        {"$sort": {"count": -1, "last": -1, "_id": 1}},
        {"$facet": {
            "meta": [{"$group": {
                "_id": None,
                "groups": {"$sum": 1},
                "users": {"$sum": {"$cond": [{"$ne": ["$_id", ""]}, 1, 0]}},
                "users_today": {"$sum": {"$cond": [{"$and": [{"$ne": ["$_id", ""]},
                                                             {"$eq": ["$today", 1]}]}, 1, 0]}},
                "records": {"$sum": "$count"},
            }}],
            "page": [{"$skip": (page - 1) * per_page}, {"$limit": per_page}],
        }},
    ]
    res = await coll.aggregate(pipeline).to_list(length=1)
    meta = (res[0]["meta"] or [{}])[0] if res else {}
    rows = res[0]["page"] if res else []
    return {
        "total_users": meta.get("users", 0),
        "users_created_today": meta.get("users_today", 0),
        "total_records": meta.get("records", 0),
        "total_groups": meta.get("groups", 0),
        "keys": [r["_id"] for r in rows],
    }


def records_for_keys(query: Dict[str, Any], keys: List[str]) -> Dict[str, Any]:
    """The same filtered query, narrowed to the given (trimmed) UHIDs."""
    return {"$and": [query, {"$expr": {"$in": [_KEY, keys]}}]}


def uhid_key(value) -> str:
    return (value or "").strip()
