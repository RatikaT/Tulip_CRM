"""
EnrollmentID Generator
Format: ENR_DDMMYYYY_XXX (sequential per day)
"""
from datetime import datetime


async def generate_enrollment_id(db) -> str:
    """
    Generate a unique EnrollmentID in format: ENR_DDMMYYYY_XXX

    Examples:
    - ENR_24122025_001 (First enrollment on Dec 24, 2025)
    - ENR_24122025_002 (Second enrollment on Dec 24, 2025)
    - ENR_25122025_001 (First enrollment on Dec 25, 2025)
    """
    # Get current date in DDMMYYYY format
    date_str = datetime.now().strftime('%d%m%Y')
    prefix = f"ENR_{date_str}"

    # Count existing enrollments for today
    count = await db.enrollments.count_documents({
        "enrollment_id": {"$regex": f"^{prefix}"}
    })

    # Generate next sequential number (3 digits, zero-padded)
    next_num = count + 1
    enrollment_id = f"{prefix}_{next_num:03d}"

    return enrollment_id


def parse_enrollment_id(enrollment_id: str) -> dict:
    """
    Parse an EnrollmentID to extract its components

    Args:
        enrollment_id: EnrollmentID string (e.g., "ENR_24122025_001")

    Returns:
        dict with prefix, date, sequence number
    """
    parts = enrollment_id.split("_")
    if len(parts) != 3:
        raise ValueError(f"Invalid EnrollmentID format: {enrollment_id}")

    return {
        "prefix": parts[0],
        "date": parts[1],
        "sequence": int(parts[2])
    }
