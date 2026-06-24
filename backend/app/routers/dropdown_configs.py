"""
Dropdown Configs Router
CRUD operations for admin-configurable dropdown options
"""
from fastapi import APIRouter, HTTPException, status, Depends
from typing import List, Optional, Dict
from datetime import datetime
from pydantic import BaseModel
import logging

from app.models.dropdown_config import DropdownConfig
from app.middleware.auth_middleware import get_current_admin, get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


# Pydantic schemas for request/response
class DropdownConfigResponse(BaseModel):
    id: str
    field_name: str
    display_name: str
    category: str
    options: List[str]
    conditional_options: Optional[Dict[str, List[str]]] = None
    is_conditional: bool
    parent_field: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class DropdownConfigListResponse(BaseModel):
    configs: List[DropdownConfigResponse]
    total: int


class AddOptionRequest(BaseModel):
    value: str
    parent_value: Optional[str] = None  # For conditional dropdowns


class RemoveOptionRequest(BaseModel):
    value: str
    parent_value: Optional[str] = None  # For conditional dropdowns


class UpdateOptionsRequest(BaseModel):
    options: Optional[List[str]] = None
    conditional_options: Optional[Dict[str, List[str]]] = None


def config_to_response(config: DropdownConfig) -> DropdownConfigResponse:
    """Convert DropdownConfig document to response schema"""
    return DropdownConfigResponse(
        id=str(config.id),
        field_name=config.field_name,
        display_name=config.display_name,
        category=config.category,
        options=config.options,
        conditional_options=config.conditional_options,
        is_conditional=config.is_conditional,
        parent_field=config.parent_field,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


@router.get("", response_model=DropdownConfigListResponse)
async def list_dropdown_configs(
    category: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List all dropdown configurations"""
    query = {}
    if category:
        query["category"] = category

    configs = await DropdownConfig.find(query).sort("display_name").to_list()

    return DropdownConfigListResponse(
        configs=[config_to_response(c) for c in configs],
        total=len(configs)
    )


@router.get("/{field_name}", response_model=DropdownConfigResponse)
async def get_dropdown_config(
    field_name: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific dropdown configuration by field name"""
    config = await DropdownConfig.find_one(DropdownConfig.field_name == field_name)

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dropdown config '{field_name}' not found"
        )

    return config_to_response(config)


@router.put("/{field_name}", response_model=DropdownConfigResponse)
async def update_dropdown_config(
    field_name: str,
    update_data: UpdateOptionsRequest,
    current_user: dict = Depends(get_current_admin)
):
    """Update dropdown options (Admin only)"""
    config = await DropdownConfig.find_one(DropdownConfig.field_name == field_name)

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dropdown config '{field_name}' not found"
        )

    if update_data.options is not None:
        config.options = update_data.options

    if update_data.conditional_options is not None:
        config.conditional_options = update_data.conditional_options

    config.updated_at = datetime.utcnow()
    await config.save()

    logger.info(f"Dropdown config updated: {field_name} by {current_user['full_name']}")

    return config_to_response(config)


@router.post("/{field_name}/add-option", response_model=DropdownConfigResponse)
async def add_dropdown_option(
    field_name: str,
    request: AddOptionRequest,
    current_user: dict = Depends(get_current_admin)
):
    """Add a new option to a dropdown (Admin only)"""
    config = await DropdownConfig.find_one(DropdownConfig.field_name == field_name)

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dropdown config '{field_name}' not found"
        )

    if config.is_conditional:
        # For conditional dropdowns, add to conditional_options
        if not request.parent_value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="parent_value is required for conditional dropdowns"
            )

        if config.conditional_options is None:
            config.conditional_options = {}

        if request.parent_value not in config.conditional_options:
            config.conditional_options[request.parent_value] = []

        if request.value in config.conditional_options[request.parent_value]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Option '{request.value}' already exists for parent '{request.parent_value}'"
            )

        config.conditional_options[request.parent_value].append(request.value)
    else:
        # For regular dropdowns, add to options
        if request.value in config.options:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Option '{request.value}' already exists"
            )
        config.options.append(request.value)

    config.updated_at = datetime.utcnow()
    await config.save()

    logger.info(f"Option added to {field_name}: '{request.value}' by {current_user['full_name']}")

    return config_to_response(config)


@router.post("/{field_name}/remove-option", response_model=DropdownConfigResponse)
async def remove_dropdown_option(
    field_name: str,
    request: RemoveOptionRequest,
    current_user: dict = Depends(get_current_admin)
):
    """Remove an option from a dropdown (Admin only)"""
    config = await DropdownConfig.find_one(DropdownConfig.field_name == field_name)

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dropdown config '{field_name}' not found"
        )

    if config.is_conditional:
        # For conditional dropdowns, remove from conditional_options
        if not request.parent_value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="parent_value is required for conditional dropdowns"
            )

        if config.conditional_options is None or request.parent_value not in config.conditional_options:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parent '{request.parent_value}' not found"
            )

        if request.value not in config.conditional_options[request.parent_value]:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Option '{request.value}' not found for parent '{request.parent_value}'"
            )

        config.conditional_options[request.parent_value].remove(request.value)
    else:
        # For regular dropdowns, remove from options
        if request.value not in config.options:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Option '{request.value}' not found"
            )
        config.options.remove(request.value)

    config.updated_at = datetime.utcnow()
    await config.save()

    logger.info(f"Option removed from {field_name}: '{request.value}' by {current_user['full_name']}")

    return config_to_response(config)


@router.post("/{field_name}/add-parent-option", response_model=DropdownConfigResponse)
async def add_parent_option(
    field_name: str,
    request: AddOptionRequest,
    current_user: dict = Depends(get_current_admin)
):
    """Add a new parent option to a conditional dropdown (Admin only)
    This creates a new parent category that can have child options added to it."""
    config = await DropdownConfig.find_one(DropdownConfig.field_name == field_name)

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dropdown config '{field_name}' not found"
        )

    if not config.is_conditional:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'{field_name}' is not a conditional dropdown"
        )

    if config.conditional_options is None:
        config.conditional_options = {}

    if request.value in config.conditional_options:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Parent option '{request.value}' already exists"
        )

    # Create new parent with empty child list
    config.conditional_options[request.value] = []

    config.updated_at = datetime.utcnow()
    await config.save()

    logger.info(f"Parent option added to {field_name}: '{request.value}' by {current_user['full_name']}")

    return config_to_response(config)


@router.post("/seed", response_model=dict)
async def seed_dropdown_configs(
    current_user: dict = Depends(get_current_admin)
):
    """Seed initial dropdown configurations from hardcoded values (Admin only)
    This is a one-time operation to migrate existing hardcoded values to the database."""

    # Define all dropdown configurations
    configs = [
        # Lead dropdowns
        {
            "field_name": "lead_source",
            "display_name": "Lead Source",
            "category": "leads",
            "options": [
                "Prescription Dump",
                "In Clinic-Gynae Consult",
                "In Clinic-Other Consults",
                "In Clinic-Walk In",
                "AMA",
                "BEWELL",
                "Events",
                "Call",
                "Others",
                "Bump Day",
                "WhatsApp",
                "Mail",
                "Tele-Consultation",
                "Website",
                "Habit Banner",
            ],
            "is_conditional": False,
        },
        {
            "field_name": "lead_status",
            "display_name": "Lead Status",
            "category": "leads",
            "options": [
                "Not Interested",
                "Enquiry Lead",
                "Lead Closed-No Response",
                "Enrolled",
                "Follow up-In Process",
                "Follow up-No Response",
                "Duplicate",
            ],
            "is_conditional": False,
        },
        {
            "field_name": "trimester",
            "display_name": "Trimester",
            "category": "common",
            "options": [
                "Trimester 1",
                "Trimester 2",
                "Trimester 3",
                "Not Conceived",
            ],
            "is_conditional": False,
        },
        {
            "field_name": "looking_for",
            "display_name": "Looking For",
            "category": "leads",
            "options": ["Self", "Family Member"],
            "is_conditional": False,
        },
        {
            "field_name": "service_enrolled",
            "display_name": "Service Enrolled",
            "category": "common",
            "options": [
                "Antenatal",
                "PreConception",
                "MaternityWellness",
            ],
            "is_conditional": False,
        },
        {
            "field_name": "service_partner",
            "display_name": "Service Partner",
            "category": "common",
            "options": [
                "Apollo Cradle",
                "Fortis",
                "Fortis La Femme",
                "Mamily",
                "Motherhood",
                "Rainbow",
                "Thyrocare",
                "Agilus",
                "Others",
            ],
            "is_conditional": False,
        },
        {
            "field_name": "reason_for_no_sale",
            "display_name": "Reason for No Sale",
            "category": "leads",
            "options": [
                "Already Taking Service outside",
                "Location not suitable",
                "Different Service Provider Required-Brand",
                "Travelling to Native Place for delivery",
                "Package Cost",
                "Only Delivery Package required",
                "Package inadequate",
                "Miscarriage",
                "Looking for other HCLH services",
                "Others",
            ],
            "is_conditional": False,
        },
        {
            "field_name": "package_options",
            "display_name": "Package Options",
            "category": "common",
            "options": [
                "Tulip Pre-Conception",
                "Tulip Antenatal",
                "Tulip Wellness",
                "Tulip Pre-Conception + Antenatal",
                "Tulip Antenatal + Wellness",
                "Tulip Pre-Conception + Antenatal + Wellness",
            ],
            "is_conditional": False,
        },
        # Enrollment-specific dropdowns
        {
            "field_name": "connect_status",
            "display_name": "Connect Status",
            "category": "enrollments",
            "options": [
                "Connected",
                "No Response",
                "Follow Up Required",
                "Others",
            ],
            "is_conditional": False,
        },
        {
            "field_name": "action_taken",
            "display_name": "Action Taken",
            "category": "enrollments",
            "options": [
                "Appointment Booked",
                "Feedback Taken",
                "No Action Required",
                "Liasoned with Partner Team",
            ],
            "is_conditional": False,
        },
        # Conditional dropdown - Partner Center based on Service Partner
        {
            "field_name": "partner_center",
            "display_name": "Partner Center",
            "category": "common",
            "options": [],  # Empty for conditional
            "is_conditional": True,
            "parent_field": "service_partner",
            "conditional_options": {
                "Apollo Cradle": [
                    "Kondapur - Door No 2-34/2, Plot No.1 & 6, Kothaguda X-Roads, Hyderabad - 500032",
                    "Jubilee Hills - Plot No. 565, Road No. 92, Hyderabad - 500 034",
                    "Chirag Enclave - Plot no. A-2, Ground Floor Outer Ring Rd, Greater Kailash-1, New Delhi, Delhi 110048",
                    "Motinagar - Plot No - 15A, Nazafgarh Road, Near Haldiram, New Delhi-110015",
                    "Amritsar - Naushera House, Court Road, Inside Hotel Fairfield By Marriott, Amritsar, Punjab 143001",
                    "Brookefield - 101/209 & 210, ITPL Main Road, Kundalahalli, Bengaluru - 560 037",
                    "Jayanagar - #25, 46th Cross, 5th Block, Near Raghavendra Swamy Mutt, Bengaluru - 560 011",
                    "Koramangala - #58, 5th Cross, 18th Main, 6th Block, Near Anand Sweets, Bengaluru - 560 095",
                    "Rajajinagar - 25/5, 1st Main Road, E Block Subramanya Nagar, 2nd Stage, Bengaluru, Karnataka 560010",
                    "Karapakkam - 2/319, OMR Service Rd, Karapakkam, Chennai, Tamil Nadu 600097",
                    "Indirapuram - NH-1, Shakti Khand 2, Indirapuram, Ghaziabad, Uttar Pradesh 201014",
                    "Electronic City - 3rd floor, TVR polestar, 1669, 27th Main Rd, 2nd Sector, HSR Layout, Bengaluru, Karnataka 560102",
                    "HSR Layout - 374/42/4,5,6,7,8,9,11, Hosa Road, Hosur Road, Bengaluru, Karnataka 560100",
                    "Greater Noida - Pocket 7, NSG Chowk, NH-27, near IFS Villas, Greater Noida, Uttar Pradesh 201310",
                ],
                "Fortis La Femme": [
                    "La Femme Greater Kailash",
                ],
                "Fortis": [
                    "Fortis Hospital Noida",
                    "Fortis Hospital Faridabad",
                    "Fortis Hospital Greater Noida",
                    "Fortis Hospital Mulund",
                    "Fortis Hospital Bannerghatta Road",
                    "Fortis Hospital Nagarbhavi",
                    "Fortis Hospital Manesar",
                    "Fortis S L Raheja Hospital",
                ],
                "Rainbow": [
                    "Madhukar Rainbow Children's Hospital, New Delhi - FC-29, Geetanjali Marg, Near Malviya Nagar Metro Station",
                    "Rosewalk, New Delhi - N-88, Block N, Panchsheel Park North",
                    "Rainbow Marathalli, Bangalore - Survey No. 8/5, Marathalli-KR Puram, Outer Ring Road",
                    "Rainbow Bannerghatta, Bangalore - 178/1 & 178/2, Bannerghatta Road, opposite Janardhan towers",
                    "Rainbow BIAL Road, Bangalore - International Airport Road, Opp. To Kodandarama, Byatarayanapura",
                    "Rainbow Bellandur, Bangalore - 3/2, Sarjapur Main Road, Next to Aishwarya Hyper City",
                    "Rainbow Clinic Hennur, Bangalore - Harshini Archade, First Floor, Kothanur Main Road",
                    "Rainbow Clinic Bilekahalli, Bangalore - 3rd Floor, No.562, 640, Bannerghatta Rd",
                    "Rainbow Banjara Hills, Hyderabad - Road No. 2, Beside Park Hyatt, Sri Nagar Colony",
                    "Rainbow Kukatpally, Hyderabad - Plot No. 1, Mumbai Highway Road, Opposite Chermas Cinemas",
                    "Rainbow LB Nagar, Hyderabad - 73/C 73/D Survey No.#52, Saraswati Nagar Colony",
                    "Rainbow Secunderabad, Hyderabad - H.No. 3-7-222 & 3-7-223, Main Road, Karkhana",
                    "Rainbow Kondapur, Hyderabad - Plot No. 32 & 33 Survey No. 12, Opp CII Kondapur",
                    "Rainbow Heart Institute, Hyderabad - Road No. 10, Banjara Hills",
                    "Rainbow Financial District, Hyderabad - Survey No. 74, Financial District, Nanakramguda",
                    "Rainbow Himayatnagar, Hyderabad - Old MLA Quarters Rd, AP State Housing Board",
                    "Rainbow Clinic HITEC City, Hyderabad - Survey No. 9, White Field Rd, Kondapur",
                    "Rainbow Clinic Attapur, Hyderabad - Shop No 302, pillar no 118, Mcube Mall, Attapur Main Rd",
                    "Rainbow Guindy, Chennai - 157, Anna Salai, Near Little Mount Metro Station",
                    "Rainbow Sholinganallur, Chennai - 493, OMR - ECR Link Road Toll",
                    "Rainbow Annanagar, Chennai - Pillaiyar Koil St, Near VR Mall, Thirumangalam",
                    "Rainbow Vijayawada - 48-10, 12/2A, service Road beside Aahaar Food Court, Nagarjuna Nagar",
                    "Rainbow Clinic Vijayawada - 29-4-4, Kodandarami Reddy St, Governor Peta",
                    "Rainbow Warangal - Brahmanawada, Machili Bazar, Hanamkonda",
                    "Rainbow Visakhapatnam - Plot No.15A, Survey No.21 & 27 Health City, Chinnagadili",
                    "Rainbow Clinic Visakhapatnam - Besides Fourpoints Hotel, 10-28-2/2/1, Waltair Uplands",
                    "Pratiksha Rainbow Hospital, Guwahati - VIP Rd, Borbari",
                ],
                "Motherhood": [
                    "Motherhood Indiranagar, Bengaluru - 324, Chinmaya Mission Hospital Rd, Indiranagar",
                    "Motherhood Sarjapur, Bengaluru - 514/1-2-3, Kaikondara Village, opp. More mall, Sarjapur Road",
                    "Motherhood Hebbal, Bengaluru - 2266/17 & 18, Service Road, G Block, Sahakara Nagar",
                    "Motherhood HRBR, Bengaluru - 914, 5th A Cross Road, HRBR Layout 1st Block, Kalyan Nagar",
                    "Motherhood Banashankari, Bengaluru - #4 30th Main Rd, Banashankari 3rd Stage",
                    "Motherhood Electronic City, Bengaluru - #8321, Survey No 164, Neeladri Road, Electronic City Phase I",
                    "Motherhood Clinic Kanakpura, Bengaluru - #3490 1st Floor, 80FT Road, Banashankari 6th Stage",
                    "Motherhood Whitefield, Bangalore - 34, Whitefield Main Rd Next to Forum Value Mall",
                    "Motherhood Alwarpet, Chennai - New No. 542, TTK Road, Opp. Indian Terrain",
                    "Women's Center By Motherhood, Coimbatore - 146B, Mettupalayam Road",
                    "Motherhood Kharghar, Navi Mumbai - Fountain Square Building, Sector 7, Kharghar",
                    "Motherhood Kharadi, Pune - 13/1A, Kharadi Bypass Road, Next to Kothari Hyundai Showroom",
                    "Motherhood Indore - Plot No 34,35,38,39, Scheme No.54, A.B Road Near Lotus Electronics",
                    "Motherhood Noida - B-206 A, Block B, Sector 48, Noida, Uttar Pradesh 201301",
                    "Motherhood Chaitanya Chandigarh - site No. 1 and 2, Sector 44-C, Chandigarh",
                    "Motherhood Chaitanya Zirakpur - SCO 19, Kalgidhar Enclave, Baltana, Zirakpur",
                    "Motherhood Lullanagar, Pune - Survey No. 3491, Plot 80, Opposite Mount Carmel School",
                    "Motherhood Mysore - 50/C, Municipal door No. 3041/2, D-34/1, Yadavgiri, Devraja mohalla",
                    "Motherhood Gurgaon - Plot no H-55,56,57 Sector-57, Gurugram-122011",
                    "Motherhood Mohali - Cosmo MSH Building, Sector-62, SAS Nagar",
                    "Motherhood Clinic Kannamangala, Bangalore - 2nd Floor, Uptown Square, Seegehalli",
                    "Motherhood Noida Extension - H-03, Plot No. GC-12 & GC-14/G, Greater Noida West",
                    "Motherhood Kolkata - #338, Rajdanga Main Road, Near Acropolis Mall, Kasba",
                    "Motherhood Kothanur - 2nd Floor, Above Vishal Mega Market, K Narayanapura Main Road",
                ],
            },
        },
    ]

    created_count = 0
    skipped_count = 0

    for config_data in configs:
        # Check if already exists
        existing = await DropdownConfig.find_one(
            DropdownConfig.field_name == config_data["field_name"]
        )
        if existing:
            skipped_count += 1
            continue

        # Create new config
        config = DropdownConfig(**config_data)
        await config.insert()
        created_count += 1

    logger.info(f"Dropdown configs seeded: {created_count} created, {skipped_count} skipped by {current_user['full_name']}")

    return {
        "message": "Dropdown configurations seeded successfully",
        "created": created_count,
        "skipped": skipped_count,
    }
