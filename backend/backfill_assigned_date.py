"""
Backfill assigned_date for existing leads using their created_at date.
This ensures existing leads show up correctly in "Assigned Today" stats.
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

MONGO_URL = "mongodb://localhost:27017"
DATABASE_NAME = "tulip_crm"


async def backfill_assigned_dates():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DATABASE_NAME]

    # Find leads with assigned_to but no assigned_date
    query = {
        "assigned_to": {"$ne": None, "$exists": True},
        "$or": [
            {"assigned_date": None},
            {"assigned_date": {"$exists": False}}
        ]
    }

    leads_to_update = await db.leads.find(query).to_list(length=None)
    print(f"Found {len(leads_to_update)} leads to backfill assigned_date")

    updated_count = 0
    for lead in leads_to_update:
        created_at = lead.get("created_at")
        if created_at:
            result = await db.leads.update_one(
                {"_id": lead["_id"]},
                {"$set": {"assigned_date": created_at}}
            )
            if result.modified_count > 0:
                updated_count += 1
                print(f"  Updated lead {lead.get('lead_id')}: assigned_date = {created_at}")

    print(f"\nBackfilled assigned_date for {updated_count} leads")

    # Also backfill reassigned_date for leads that have reassign_to but no reassigned_date
    query_reassign = {
        "reassign_to": {"$ne": None, "$exists": True},
        "$or": [
            {"reassigned_date": None},
            {"reassigned_date": {"$exists": False}}
        ]
    }

    leads_to_update_reassign = await db.leads.find(query_reassign).to_list(length=None)
    print(f"\nFound {len(leads_to_update_reassign)} leads to backfill reassigned_date")

    reassign_updated_count = 0
    for lead in leads_to_update_reassign:
        # Use updated_at as the reassigned_date since we don't know when it was reassigned
        updated_at = lead.get("updated_at") or lead.get("created_at")
        if updated_at:
            result = await db.leads.update_one(
                {"_id": lead["_id"]},
                {"$set": {"reassigned_date": updated_at}}
            )
            if result.modified_count > 0:
                reassign_updated_count += 1
                print(f"  Updated lead {lead.get('lead_id')}: reassigned_date = {updated_at}")

    print(f"\nBackfilled reassigned_date for {reassign_updated_count} leads")

    client.close()
    print("\nDone!")


if __name__ == "__main__":
    asyncio.run(backfill_assigned_dates())
