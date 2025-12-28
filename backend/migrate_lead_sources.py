"""
Migration script to update lead_source values to new dropdown options.

Old values: Mail, Website, WA, Call, SMS, EMR, Other
New values: In Clinic-Walk In, Mail, In Clinic-Gynae Consult, Bump Day, Website, Call, AMA, WhatsApp, In Clinic-Other Consults, Others

Mapping:
- Mail -> Mail (no change)
- Website -> Website (no change)
- WA -> WhatsApp
- Call -> Call (no change)
- SMS -> Others
- EMR -> Others
- Other -> Others
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

MONGODB_URL = "mongodb://localhost:27017"
DATABASE_NAME = "tulip_crm"

# Mapping of old values to new values
LEAD_SOURCE_MAPPING = {
    "WA": "WhatsApp",
    "SMS": "Others",
    "EMR": "Others",
    "Other": "Others",
}


async def migrate_lead_sources():
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]
    leads_collection = db.leads

    print("Starting lead source migration...")

    # Get count of leads to migrate
    for old_value, new_value in LEAD_SOURCE_MAPPING.items():
        count = await leads_collection.count_documents({"lead_source": old_value})
        if count > 0:
            print(f"Found {count} leads with lead_source='{old_value}', updating to '{new_value}'...")
            result = await leads_collection.update_many(
                {"lead_source": old_value},
                {"$set": {"lead_source": new_value}}
            )
            print(f"  Updated {result.modified_count} leads")
        else:
            print(f"No leads found with lead_source='{old_value}'")

    # Show final distribution
    print("\nFinal lead_source distribution:")
    pipeline = [
        {"$group": {"_id": "$lead_source", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    async for doc in leads_collection.aggregate(pipeline):
        print(f"  {doc['_id']}: {doc['count']}")

    print("\nMigration complete!")
    client.close()


if __name__ == "__main__":
    asyncio.run(migrate_lead_sources())
