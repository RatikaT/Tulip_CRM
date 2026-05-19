"""
Seed script for local testing — creates a spread of leads using the
current Lead model (Trimester / new LeadSource / new LeadStatus enums).

Run with:
    cd backend && .venv/bin/python seed_dummy.py
"""
import asyncio
from datetime import datetime, date, timedelta

from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie

from app.config import settings
from app.models.lead import (
    Lead,
    LeadStatus,
    LeadSource,
    Trimester,
    LookingFor,
    ServicePartner,
    ReasonForNoSale,
)
from app.models.user import User


CITIES = [
    ("Noida", "201301", "HCL Noida Clinic"),
    ("Bangalore", "560076", "HCL Bangalore Clinic"),
    ("Lucknow", "226010", "HCL Lucknow Clinic"),
    ("Delhi", "110017", "HCL Delhi Clinic"),
    ("Jaipur", "302017", "HCL Jaipur Clinic"),
    ("Pune", "411045", "HCL Pune Clinic"),
    ("Kolkata", "700091", "HCL Kolkata Clinic"),
    ("Bangalore", "560103", "HCL Bangalore Clinic"),
    ("Pune", "411057", "HCL Pune Clinic"),
    ("Delhi", "110029", "HCL Delhi Clinic"),
]

LEADS = [
    # (name, email, phone, source, status, trimester, looking_for, partner, package, reason_no_sale)
    ("Richa Sharma",     "richa.sharma@gmail.com", "9876543210",
     LeadSource.WEBSITE, LeadStatus.ENQUIRY_LEAD, Trimester.TRIMESTER_1,
     LookingFor.SELF, ServicePartner.MAMILY,    "Antenatal",         None),
    ("Ananya Verma",     "ananya.verma@gmail.com", "9898989898",
     LeadSource.WHATSAPP, LeadStatus.FOLLOWUP_IN_PROCESS, Trimester.TRIMESTER_2,
     LookingFor.SELF, ServicePartner.MOTHERHOOD, "MaternityWellness", None),
    ("Pooja Singh",      "pooja.singh@gmail.com",  "9123456789",
     LeadSource.CALL, LeadStatus.NOT_INTERESTED, Trimester.TRIMESTER_3,
     LookingFor.SELF, ServicePartner.RAINBOW,   "Antenatal",         ReasonForNoSale.ALREADY_TAKING_SERVICE_OUTSIDE),
    ("Richa Gupta",      "richa.gupta@outlook.com","9000011111",
     LeadSource.MAIL, LeadStatus.ENROLLED, Trimester.TRIMESTER_1,
     LookingFor.SELF, ServicePartner.MAMILY,    "PreConception",     None),
    ("Neha Jain",        "neha.jain@gmail.com",    "9888776655",
     LeadSource.WEBSITE, LeadStatus.LEAD_CLOSED_NO_RESPONSE, Trimester.NOT_CONCEIVED,
     LookingFor.SELF, ServicePartner.OTHERS,    "PreConception",     ReasonForNoSale.PACKAGE_COST),
    ("Kavya Iyer",       "kavya.iyer@gmail.com",   "9765432109",
     LeadSource.EVENTS, LeadStatus.ENROLLED, Trimester.TRIMESTER_2,
     LookingFor.SELF, ServicePartner.APOLLO_CRADLE, "Antenatal",     None),
    ("Richa Mehta",      "richa.mehta@gmail.com",  "9012345678",
     LeadSource.IN_CLINIC_GYNAE_CONSULT, LeadStatus.FOLLOWUP_IN_PROCESS, Trimester.TRIMESTER_3,
     LookingFor.SELF, ServicePartner.MOTHERHOOD, "MaternityWellness", None),
    ("Shalini Rao",      "shalini.rao@gmail.com",  "9345678123",
     LeadSource.AMA, LeadStatus.ENQUIRY_LEAD, Trimester.NOT_CONCEIVED,
     LookingFor.FAMILY_MEMBER, ServicePartner.RAINBOW, "Antenatal",  None),
    ("Aarti Kulkarni",   "aarti.k@gmail.com",      "9988771122",
     LeadSource.WEBSITE, LeadStatus.ENROLLED, Trimester.TRIMESTER_1,
     LookingFor.SELF, ServicePartner.FORTIS_LA_FEMME, "Antenatal",  None),
    ("Priya Malhotra",   "priya.m@gmail.com",      "9090909090",
     LeadSource.CALL, LeadStatus.FOLLOWUP_NO_RESPONSE, Trimester.TRIMESTER_2,
     LookingFor.SELF, ServicePartner.MOTHERHOOD, "MaternityWellness", None),
    ("Sneha Iyer",       "sneha.iyer@gmail.com",   "9112233445",
     LeadSource.BEWELL, LeadStatus.ENQUIRY_LEAD, Trimester.TRIMESTER_1,
     LookingFor.SELF, ServicePartner.HCL_HEALTHCARE, "Antenatal",    None),
    ("Deepika Roy",      "deepika.roy@gmail.com",  "9445566778",
     LeadSource.TELE_CONSULTATION, LeadStatus.DUPLICATE, Trimester.TRIMESTER_2,
     LookingFor.FAMILY_MEMBER, ServicePartner.CLOUD_9, "MaternityWellness", None),
]


async def seed():
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    db = client.get_default_database()
    await init_beanie(database=db, document_models=[Lead, User])
    print(f"Connected to {settings.MONGODB_URI}")

    # Reset lead collection so re-runs are idempotent
    existing = await Lead.find().count()
    if existing:
        print(f"Deleting {existing} existing leads…")
        await Lead.find().delete()

    admin = await User.find_one({"role": "admin"})
    admin_id = str(admin.id) if admin else None

    # Pull agent users (created by seed_agents.py) and round-robin assignments
    agents = await User.find({"role": "agent"}).to_list()
    agent_pool = agents or ([admin] if admin else [])

    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    for idx, row in enumerate(LEADS):
        (name, email, phone, source, status, trimester,
         looking_for, partner, package, reason_no_sale) = row
        city, pin, facility = CITIES[idx % len(CITIES)]

        created_at = today - timedelta(days=(idx % 10))
        agent = agent_pool[idx % len(agent_pool)] if agent_pool else None
        agent_id = str(agent.id) if agent else None
        agent_name = agent.full_name if agent else "Unassigned"

        lead_id = f"Tulip_{today.strftime('%d%m%Y')}_{str(idx + 1).zfill(3)}"

        calls = [
            {
                "call_number": 1,
                "date_time": created_at + timedelta(hours=2),
                "summary": f"Initial outreach to {name.split()[0]}.",
            },
        ]
        if status in (LeadStatus.FOLLOWUP_IN_PROCESS, LeadStatus.ENROLLED,
                      LeadStatus.LEAD_CLOSED_NO_RESPONSE, LeadStatus.FOLLOWUP_NO_RESPONSE):
            calls.append({
                "call_number": 2,
                "date_time": created_at + timedelta(days=1, hours=3),
                "summary": "Follow-up call.",
            })

        comments = [{
            "text": f"Lead created via {source.value}.",
            "created_at": created_at,
            "created_by_name": agent_name,
        }]

        lead = Lead(
            lead_id=lead_id,
            created_at=created_at,
            updated_at=created_at + timedelta(hours=4),
            lead_source=source,
            lead_creation_date=created_at.date(),
            status=status,
            name=name,
            email=email,
            phone_number=phone,
            employee_id=f"EMP{1000 + idx}",
            uhid=f"UH{20000 + idx}",
            user_facility=facility,
            city=city,
            pin_code=pin,
            address=f"{city} — sample address",
            trimester=trimester,
            looking_for=looking_for,
            package_requested=package,
            service_requested=package,
            service_partner=partner.value if partner else None,
            provider_location=city,
            hclhc_spoc="HCLHC SPOC",
            reason_for_no_sale=reason_no_sale,
            number_of_calls=len(calls),
            calls=calls,
            assigned_to=agent_id,
            assigned_to_name=agent_name,
            assigned_date=created_at,
            comments=comments,
            created_by=admin_id,
            is_deleted=False,
        )
        await lead.insert()
        print(f"Inserted {lead_id} — {name} ({status.value}) → {agent_name}")

    total = await Lead.find({"is_deleted": False}).count()
    print(f"\nTotal active leads: {total}")
    client.close()


if __name__ == "__main__":
    asyncio.run(seed())
