"""
Migration script: Rename provider_name to service_partner
Run from backend directory: python ../migrate_service_partner.py
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

# Valid service partner values
VALID_PARTNERS = {
    'motherhood': 'Motherhood',
    'rainbow': 'Rainbow',
    'fortis': 'Fortis',
    'apollo cradle': 'Apollo Cradle',
    'cloud 9': 'Cloud 9',
    'hcl healthcare': 'HCL Healthcare',
    'mamily': 'Mamily',
    'others': 'Others',
}

async def migrate():
    # Connect to MongoDB
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.crm_leads

    print("Starting migration: provider_name -> service_partner")

    # Find all leads with provider_name field
    leads = await db.leads.find({"provider_name": {"$exists": True}}).to_list(None)

    print(f"Found {len(leads)} leads with provider_name field")

    updated = 0
    for lead in leads:
        old_value = lead.get('provider_name')
        new_value = None

        if old_value:
            # Try to map to valid ServicePartner
            normalized = old_value.lower().strip()
            if normalized in VALID_PARTNERS:
                new_value = VALID_PARTNERS[normalized]
            else:
                # Default to Others for unknown values
                new_value = 'Others'

        # Update document: rename field and set proper value
        update_result = await db.leads.update_one(
            {"_id": lead["_id"]},
            {
                "$set": {"service_partner": new_value},
                "$unset": {"provider_name": ""}
            }
        )

        if update_result.modified_count > 0:
            updated += 1
            if old_value:
                print(f"  Lead {lead.get('lead_id', lead['_id'])}: '{old_value}' -> '{new_value}'")

    print(f"\nMigration complete: {updated} leads updated")

    # Also check for any leads that have service_partner as a string (from schema)
    leads_with_partner = await db.leads.find({"service_partner": {"$exists": True}}).to_list(None)
    print(f"Total leads with service_partner field: {len(leads_with_partner)}")

    client.close()

if __name__ == "__main__":
    asyncio.run(migrate())
