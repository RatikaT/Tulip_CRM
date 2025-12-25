"""
Seed script to add sample lead data to the database
"""
import asyncio
from datetime import datetime, date, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.lead import Lead, LeadStatus, LeadSource, Stage, LookingFor, ServiceEnrolled
from app.models.user import User
from app.config import settings


def get_recent_dates():
    """Generate recent dates for leads to appear in dashboard trends"""
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    return [today - timedelta(days=i) for i in range(10)]


# Lead data from the provided CSV - dates will be updated dynamically
LEADS_DATA = [
    {
        "lead_id": "Tulip_12082025_001",
        "created_at": None,  # Will be set dynamically
        "updated_at": None,  # Will be set dynamically
        "lead_source": LeadSource.WEBSITE,
        "lead_creation_date": date(2025, 8, 12),
        "status": LeadStatus.INTERESTED,
        "name": "Richa Sharma",
        "email": "richa.sharma@gmail.com",
        "phone_number": "9876543210",
        "employee_id": "EMP1023",
        "uhid": "UH10023",
        "user_facility": "HCL Noida Clinic",
        "city": "Noida",
        "pin_code": "201301",
        "address": "Sector 62 Noida",
        "stage": Stage.PREGNANT_1ST,
        "looking_for": LookingFor.SELF,
        "package_requested": "Antenatal",
        "service_enrolled": ServiceEnrolled.ANTENATAL,
        "package_name_enrolled": "TulipAntenatalCareThyrocare",
        "provider_name": "Thyrocare",
        "provider_location": "Noida",
        "hclhc_spoc": "Rohit Mehra",
        "doctor_name": "Dr. Priya Sharma",
        "consult_date": date(2025, 12, 20),
        "number_of_calls": 2,
        "calls": [
            {"call_number": 1, "date_time": datetime(2025, 8, 12, 11, 30), "summary": "Explained antenatal care flow and diagnostics."},
            {"call_number": 2, "date_time": datetime(2025, 8, 14, 16, 0), "summary": "User confirmed interest and asked for pricing."},
        ],
        "assigned_to_name": "Anjali",
        "comments": [
            {"text": "Initial call completed.", "created_at": datetime(2025, 8, 12), "created_by_name": "Anjali"},
            {"text": "Follow-up done. Interested.", "created_at": datetime(2025, 8, 14), "created_by_name": "Anjali"},
        ],
    },
    {
        "lead_id": "Tulip_13082025_002",
        "created_at": datetime(2025, 8, 13),
        "updated_at": datetime(2025, 8, 18),
        "lead_source": LeadSource.WA,
        "lead_creation_date": date(2025, 8, 13),
        "status": LeadStatus.FOLLOWUP_REQUIRED,
        "name": "Ananya Verma",
        "email": "ananya.verma@gmail.com",
        "phone_number": "9898989898",
        "employee_id": "EMP2045",
        "uhid": "UH10456",
        "user_facility": "HCL Bangalore Clinic",
        "city": "Bangalore",
        "pin_code": "560076",
        "address": "JP Nagar 7th Phase",
        "stage": Stage.PREGNANT_2ND,
        "looking_for": LookingFor.SELF,
        "package_requested": "MaternityWellness",
        "service_enrolled": None,
        "package_name_enrolled": None,
        "provider_name": "Motherhood",
        "provider_location": "Bangalore",
        "hclhc_spoc": "Sneha Iyer",
        "number_of_calls": 3,
        "calls": [
            {"call_number": 1, "date_time": datetime(2025, 8, 13, 14, 0), "summary": "Discussed delivery hospital options."},
            {"call_number": 2, "date_time": datetime(2025, 8, 15, 12, 0), "summary": "No response from user."},
            {"call_number": 3, "date_time": datetime(2025, 8, 18, 10, 30), "summary": "User requested brochure via WhatsApp."},
        ],
        "assigned_to_name": "Rahul",
        "comments": [
            {"text": "User needs hospital comparison.", "created_at": datetime(2025, 8, 13), "created_by_name": "Rahul"},
            {"text": "No response.", "created_at": datetime(2025, 8, 15), "created_by_name": "Rahul"},
            {"text": "Shared brochure and pricing.", "created_at": datetime(2025, 8, 18), "created_by_name": "Rahul"},
        ],
    },
    {
        "lead_id": "Tulip_14082025_003",
        "created_at": datetime(2025, 8, 14),
        "updated_at": datetime(2025, 8, 14),
        "lead_source": LeadSource.CALL,
        "lead_creation_date": date(2025, 8, 14),
        "status": LeadStatus.NOT_INTERESTED,
        "name": "Pooja Singh",
        "email": "pooja.singh@gmail.com",
        "phone_number": "9123456789",
        "employee_id": "EMP3098",
        "uhid": "UH10987",
        "user_facility": "HCL Lucknow Clinic",
        "city": "Lucknow",
        "pin_code": "226010",
        "address": "Gomti Nagar",
        "stage": Stage.PREGNANT_3RD,
        "looking_for": LookingFor.SELF,
        "package_requested": "Antenatal",
        "service_enrolled": None,
        "package_name_enrolled": None,
        "provider_name": "Rainbow",
        "provider_location": "Lucknow",
        "hclhc_spoc": "Akash Mishra",
        "number_of_calls": 1,
        "calls": [
            {"call_number": 1, "date_time": datetime(2025, 8, 14, 9, 45), "summary": "User already enrolled elsewhere."},
        ],
        "assigned_to_name": "Neha",
        "comments": [
            {"text": "Not interested – local doctor.", "created_at": datetime(2025, 8, 14), "created_by_name": "Neha"},
        ],
    },
    {
        "lead_id": "Tulip_15082025_004",
        "created_at": datetime(2025, 8, 15),
        "updated_at": datetime(2025, 8, 18),
        "lead_source": LeadSource.MAIL,
        "lead_creation_date": date(2025, 8, 15),
        "status": LeadStatus.INTERESTED,
        "name": "Richa Gupta",
        "email": "richa.gupta@outlook.com",
        "phone_number": "9000011111",
        "employee_id": "EMP4012",
        "uhid": "UH11234",
        "user_facility": "HCL Delhi Clinic",
        "city": "Delhi",
        "pin_code": "110017",
        "address": "Saket",
        "stage": Stage.PREGNANT_1ST,
        "looking_for": LookingFor.SELF,
        "package_requested": "PreConception",
        "service_enrolled": ServiceEnrolled.PRE_CONCEPTION,
        "package_name_enrolled": "Tulip3MonthAntenatal",
        "provider_name": "Mamily",
        "provider_location": "Delhi",
        "hclhc_spoc": "Vikas Khanna",
        "number_of_calls": 2,
        "calls": [
            {"call_number": 1, "date_time": datetime(2025, 8, 15, 12, 20), "summary": "Explained 3-month program benefits."},
            {"call_number": 2, "date_time": datetime(2025, 8, 18, 15, 10), "summary": "User agreed to enroll."},
        ],
        "assigned_to_name": "Simran",
        "comments": [
            {"text": "Shared program overview.", "created_at": datetime(2025, 8, 15), "created_by_name": "Simran"},
            {"text": "Enrollment confirmed.", "created_at": datetime(2025, 8, 18), "created_by_name": "Simran"},
        ],
    },
    {
        "lead_id": "Tulip_16082025_005",
        "created_at": datetime(2025, 8, 16),
        "updated_at": datetime(2025, 8, 19),
        "lead_source": LeadSource.WEBSITE,
        "lead_creation_date": date(2025, 8, 16),
        "status": LeadStatus.LEAD_CLOSED_NO_RESPONSE,
        "name": "Neha Jain",
        "email": "neha.jain@gmail.com",
        "phone_number": "9888776655",
        "employee_id": "EMP5120",
        "uhid": "UH11567",
        "user_facility": "HCL Jaipur Clinic",
        "city": "Jaipur",
        "pin_code": "302017",
        "address": "Malviya Nagar",
        "stage": Stage.PLANNING_FOR_PREGNANCY,
        "looking_for": LookingFor.SELF,
        "package_requested": "PreConception",
        "service_enrolled": None,
        "package_name_enrolled": None,
        "provider_name": "Thyrocare",
        "provider_location": "Jaipur",
        "hclhc_spoc": "Ritu Sharma",
        "number_of_calls": 3,
        "calls": [
            {"call_number": 1, "date_time": datetime(2025, 8, 16, 10, 10), "summary": "Call not answered."},
            {"call_number": 2, "date_time": datetime(2025, 8, 18, 11, 0), "summary": "Second attempt no response."},
            {"call_number": 3, "date_time": datetime(2025, 8, 19, 11, 30), "summary": "Lead closed."},
        ],
        "assigned_to_name": "Ankit",
        "comments": [
            {"text": "No response.", "created_at": datetime(2025, 8, 16), "created_by_name": "Ankit"},
            {"text": "No response.", "created_at": datetime(2025, 8, 18), "created_by_name": "Ankit"},
            {"text": "Lead closed.", "created_at": datetime(2025, 8, 19), "created_by_name": "Ankit"},
        ],
    },
    {
        "lead_id": "Tulip_17082025_006",
        "created_at": datetime(2025, 8, 17),
        "updated_at": datetime(2025, 8, 18),
        "lead_source": LeadSource.SMS,
        "lead_creation_date": date(2025, 8, 17),
        "status": LeadStatus.INTERESTED,
        "name": "Kavya Iyer",
        "email": "kavya.iyer@gmail.com",
        "phone_number": "9765432109",
        "employee_id": "EMP6234",
        "uhid": "UH11890",
        "user_facility": "HCL Pune Clinic",
        "city": "Pune",
        "pin_code": "411045",
        "address": "Baner",
        "stage": Stage.PREGNANT_2ND,
        "looking_for": LookingFor.SELF,
        "package_requested": "Antenatal",
        "service_enrolled": ServiceEnrolled.ANTENATAL,
        "package_name_enrolled": "TulipAntenatalCareThyrocare",
        "provider_name": "Thyrocare",
        "provider_location": "Pune",
        "hclhc_spoc": "Sameer Joshi",
        "number_of_calls": 2,
        "calls": [
            {"call_number": 1, "date_time": datetime(2025, 8, 17, 13, 40), "summary": "Interested in diagnostics and diet consult."},
            {"call_number": 2, "date_time": datetime(2025, 8, 18, 17, 30), "summary": "Package enrolled."},
        ],
        "assigned_to_name": "Priya",
        "comments": [
            {"text": "Positive response.", "created_at": datetime(2025, 8, 17), "created_by_name": "Priya"},
            {"text": "Enrollment done.", "created_at": datetime(2025, 8, 18), "created_by_name": "Priya"},
        ],
    },
    {
        "lead_id": "Tulip_18082025_007",
        "created_at": datetime(2025, 8, 18),
        "updated_at": datetime(2025, 8, 21),
        "lead_source": LeadSource.EMR,
        "lead_creation_date": date(2025, 8, 18),
        "status": LeadStatus.FOLLOWUP_REQUIRED,
        "name": "Richa Mehta",
        "email": "richa.mehta@gmail.com",
        "phone_number": "9012345678",
        "employee_id": "EMP7345",
        "uhid": "UH12123",
        "user_facility": "HCL Kolkata Clinic",
        "city": "Kolkata",
        "pin_code": "700091",
        "address": "Salt Lake",
        "stage": Stage.NEW_MOM,
        "looking_for": LookingFor.SELF,
        "package_requested": "MaternityWellness",
        "service_enrolled": None,
        "package_name_enrolled": None,
        "provider_name": "Motherhood",
        "provider_location": "Kolkata",
        "hclhc_spoc": "Debashis Roy",
        "number_of_calls": 2,
        "calls": [
            {"call_number": 1, "date_time": datetime(2025, 8, 18, 16, 10), "summary": "Asked about postnatal wellness."},
            {"call_number": 2, "date_time": datetime(2025, 8, 21, 11, 0), "summary": "Needs family confirmation."},
        ],
        "assigned_to_name": "Arjun",
        "comments": [
            {"text": "Interested but unsure.", "created_at": datetime(2025, 8, 18), "created_by_name": "Arjun"},
            {"text": "Decision pending.", "created_at": datetime(2025, 8, 21), "created_by_name": "Arjun"},
        ],
    },
    {
        "lead_id": "Tulip_19082025_008",
        "created_at": datetime(2025, 8, 19),
        "updated_at": datetime(2025, 8, 19),
        "lead_source": LeadSource.OTHER,
        "lead_creation_date": date(2025, 8, 19),
        "status": LeadStatus.NEW,
        "name": "Shalini Rao",
        "email": "shalini.rao@gmail.com",
        "phone_number": "9345678123",
        "employee_id": "EMP8456",
        "uhid": "UH12456",
        "user_facility": "HCL Bangalore Clinic",
        "city": "Bangalore",
        "pin_code": "560103",
        "address": "Whitefield",
        "stage": Stage.EXPLORING,
        "looking_for": LookingFor.FAMILY_MEMBER,
        "package_requested": "Antenatal",
        "service_enrolled": None,
        "package_name_enrolled": None,
        "provider_name": "Rainbow",
        "provider_location": "Bangalore",
        "hclhc_spoc": "Megha Rao",
        "number_of_calls": 1,
        "calls": [
            {"call_number": 1, "date_time": datetime(2025, 8, 19, 18, 0), "summary": "Lead captured during wellness camp."},
        ],
        "assigned_to_name": "Kiran",
        "comments": [
            {"text": "New camp lead.", "created_at": datetime(2025, 8, 19), "created_by_name": "Kiran"},
        ],
    },
    {
        "lead_id": "Tulip_20082025_009",
        "created_at": datetime(2025, 8, 20),
        "updated_at": datetime(2025, 8, 22),
        "lead_source": LeadSource.WEBSITE,
        "lead_creation_date": date(2025, 8, 20),
        "status": LeadStatus.INTERESTED,
        "name": "Aarti Kulkarni",
        "email": "aarti.k@gmail.com",
        "phone_number": "9988771122",
        "employee_id": "EMP9567",
        "uhid": "UH12789",
        "user_facility": "HCL Pune Clinic",
        "city": "Pune",
        "pin_code": "411057",
        "address": "Hinjewadi",
        "stage": Stage.PREGNANT_1ST,
        "looking_for": LookingFor.SELF,
        "package_requested": "Antenatal",
        "service_enrolled": ServiceEnrolled.ANTENATAL,
        "package_name_enrolled": "Tulip3MonthAntenatal",
        "provider_name": "Mamily",
        "provider_location": "Pune",
        "hclhc_spoc": "Nikhil Patil",
        "number_of_calls": 3,
        "calls": [
            {"call_number": 1, "date_time": datetime(2025, 8, 20, 9, 30), "summary": "Requested price breakup."},
            {"call_number": 2, "date_time": datetime(2025, 8, 21, 13, 0), "summary": "Follow-up call done."},
            {"call_number": 3, "date_time": datetime(2025, 8, 22, 14, 0), "summary": "Enrollment completed."},
        ],
        "assigned_to_name": "Sonal",
        "comments": [
            {"text": "Price shared.", "created_at": datetime(2025, 8, 20), "created_by_name": "Sonal"},
            {"text": "Follow-up successful.", "created_at": datetime(2025, 8, 21), "created_by_name": "Sonal"},
            {"text": "Enrolled.", "created_at": datetime(2025, 8, 22), "created_by_name": "Sonal"},
        ],
    },
    {
        "lead_id": "Tulip_21082025_010",
        "created_at": datetime(2025, 8, 21),
        "updated_at": datetime(2025, 8, 23),
        "lead_source": LeadSource.CALL,
        "lead_creation_date": date(2025, 8, 21),
        "status": LeadStatus.NO_RESPONSE,
        "name": "Priya Malhotra",
        "email": "priya.m@gmail.com",
        "phone_number": "9090909090",
        "employee_id": "EMP0678",
        "uhid": "UH13001",
        "user_facility": "HCL Delhi Clinic",
        "city": "Delhi",
        "pin_code": "110029",
        "address": "Vasant Kunj",
        "stage": Stage.PREGNANT_2ND,
        "looking_for": LookingFor.SELF,
        "package_requested": "MaternityWellness",
        "service_enrolled": None,
        "package_name_enrolled": None,
        "provider_name": "Motherhood",
        "provider_location": "Delhi",
        "hclhc_spoc": "Aman Verma",
        "number_of_calls": 2,
        "calls": [
            {"call_number": 1, "date_time": datetime(2025, 8, 21, 15, 15), "summary": "Call not answered."},
            {"call_number": 2, "date_time": datetime(2025, 8, 23, 12, 0), "summary": "Second attempt no response."},
        ],
        "assigned_to_name": "Deepak",
        "comments": [
            {"text": "No response.", "created_at": datetime(2025, 8, 21), "created_by_name": "Deepak"},
            {"text": "Will retry later.", "created_at": datetime(2025, 8, 23), "created_by_name": "Deepak"},
        ],
    },
]


async def seed_leads():
    """Seed the database with sample leads"""
    # Connect to MongoDB
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    db = client.get_default_database()

    # Initialize Beanie
    await init_beanie(database=db, document_models=[Lead, User])

    print("Connected to MongoDB")

    # Get the admin user for assignment
    admin_user = await User.find_one({"role": "admin"})
    admin_id = str(admin_user.id) if admin_user else None

    # Clear existing leads (optional - comment out if you want to keep existing)
    existing_count = await Lead.find().count()
    if existing_count > 0:
        print(f"Found {existing_count} existing leads. Deleting...")
        await Lead.find().delete()
        print("Existing leads deleted")

    # Generate recent dates for dashboard trends
    recent_dates = get_recent_dates()
    today = datetime.now()

    # Insert new leads
    inserted_count = 0
    for idx, lead_data in enumerate(LEADS_DATA):
        try:
            # Use recent dates for leads to appear in dashboard trends
            lead_created_at = recent_dates[idx % len(recent_dates)]
            lead_updated_at = lead_created_at + timedelta(hours=2)  # Updated 2 hours later

            # Generate lead_id with today's date format
            lead_id = f"Tulip_{today.strftime('%d%m%Y')}_{str(idx + 1).zfill(3)}"

            # Create the lead
            lead = Lead(
                lead_id=lead_id,
                created_at=lead_created_at,
                updated_at=lead_updated_at,
                lead_source=lead_data["lead_source"],
                lead_creation_date=lead_created_at.date(),  # Use same date as created_at
                status=lead_data["status"],
                name=lead_data["name"],
                email=lead_data["email"],
                phone_number=lead_data["phone_number"],
                employee_id=lead_data["employee_id"],
                uhid=lead_data["uhid"],
                user_facility=lead_data["user_facility"],
                city=lead_data["city"],
                pin_code=lead_data["pin_code"],
                address=lead_data["address"],
                stage=lead_data["stage"],
                looking_for=lead_data["looking_for"],
                package_requested=lead_data["package_requested"],
                service_enrolled=lead_data["service_enrolled"],
                package_name_enrolled=lead_data["package_name_enrolled"],
                provider_name=lead_data["provider_name"],
                provider_location=lead_data["provider_location"],
                hclhc_spoc=lead_data["hclhc_spoc"],
                doctor_name=lead_data.get("doctor_name"),
                consult_date=lead_data.get("consult_date"),
                number_of_calls=lead_data["number_of_calls"],
                calls=lead_data["calls"],
                assigned_to=admin_id,
                assigned_to_name=lead_data["assigned_to_name"],
                comments=lead_data["comments"],
                created_by=admin_id,
                is_deleted=False,
            )
            await lead.insert()
            inserted_count += 1
            print(f"Inserted: {lead_id} - {lead_data['name']} (created: {lead_created_at.strftime('%Y-%m-%d')})")
        except Exception as e:
            print(f"Error inserting {lead_id}: {e}")

    print(f"\nTotal leads inserted: {inserted_count}")

    # Verify the count
    total = await Lead.find({"is_deleted": False}).count()
    print(f"Total leads in database: {total}")

    # Close connection
    client.close()


if __name__ == "__main__":
    asyncio.run(seed_leads())
