"""
LeadID Generator
Format: Tulip_DDMMYYYY_XXX (sequential per day)
"""
from datetime import datetime
from app.config import settings


async def generate_lead_id(db) -> str:
    """
    Generate a unique LeadID in format: Tulip_DDMMYYYY_XXX

    Examples:
    - Tulip_24122025_001 (First lead on Dec 24, 2025)
    - Tulip_24122025_002 (Second lead on Dec 24, 2025)
    - Tulip_25122025_001 (First lead on Dec 25, 2025)
    """
    # Get current date in DDMMYYYY format
    date_str = datetime.now().strftime('%d%m%Y')
    prefix = f"{settings.LEAD_ID_PREFIX}_{date_str}"

    # Count existing leads for today
    count = await db.leads.count_documents({
        "lead_id": {"$regex": f"^{prefix}"}
    })

    # Generate next sequential number (3 digits, zero-padded)
    next_num = count + 1
    lead_id = f"{prefix}_{next_num:03d}"

    return lead_id


def parse_lead_id(lead_id: str) -> dict:
    """
    Parse a LeadID to extract its components

    Args:
        lead_id: LeadID string (e.g., "Tulip_24122025_001")

    Returns:
        dict with prefix, date, sequence number
    """
    parts = lead_id.split("_")
    if len(parts) != 3:
        raise ValueError(f"Invalid LeadID format: {lead_id}")

    return {
        "prefix": parts[0],
        "date": parts[1],
        "sequence": int(parts[2])
    }
