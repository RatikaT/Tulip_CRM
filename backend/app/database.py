"""
MongoDB Database Connection and Setup
"""
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.config import settings

logger = logging.getLogger(__name__)

# Global database client
client: AsyncIOMotorClient = None
db = None


async def connect_to_database():
    """Connect to MongoDB and initialize Beanie ODM"""
    global client, db

    logger.info(f"Connecting to MongoDB: {settings.MONGODB_URI}")

    try:
        client = AsyncIOMotorClient(settings.MONGODB_URI)
        db = client.get_default_database()

        # Import models here to avoid circular imports
        from app.models.user import User
        from app.models.lead import Lead
        from app.models.audit_log import AuditLog
        from app.models.summary import Summary
        from app.models.custom_field import CustomField
        from app.models.knowledge_document import KnowledgeDocument
        from app.models.document_chunk import DocumentChunk
        from app.models.chat_session import ChatSession
        from app.models.enrollment import Enrollment
        from app.models.enrollment_audit_log import EnrollmentAuditLog
        from app.models.dropdown_config import DropdownConfig

        # Initialize Beanie with document models
        await init_beanie(
            database=db,
            document_models=[
                User,
                Lead,
                AuditLog,
                Summary,
                CustomField,
                KnowledgeDocument,
                DocumentChunk,
                ChatSession,
                Enrollment,
                EnrollmentAuditLog,
                DropdownConfig
            ]
        )

        logger.info("Successfully connected to MongoDB and initialized Beanie")

        # Create indexes
        await create_indexes()

    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {e}")
        raise


async def close_database_connection():
    """Close MongoDB connection"""
    global client

    if client:
        client.close()
        logger.info("Closed MongoDB connection")


async def create_indexes():
    """Create database indexes for performance"""
    logger.info("Creating database indexes...")

    # Lead indexes
    await db.leads.create_index("lead_id", unique=True)
    await db.leads.create_index("phone_number")
    await db.leads.create_index("email")
    await db.leads.create_index([("assigned_to", 1), ("status", 1)])
    await db.leads.create_index([("created_at", -1)])
    await db.leads.create_index("lead_source")
    await db.leads.create_index("follow_up_date")
    await db.leads.create_index("status")

    # User indexes
    await db.users.create_index("username", unique=True)
    await db.users.create_index("email", unique=True)

    # Audit log indexes
    await db.audit_logs.create_index([("lead_id", 1), ("timestamp", -1)])
    await db.audit_logs.create_index("user_id")

    # Custom field indexes
    await db.custom_fields.create_index("field_name", unique=True)

    # Knowledge Base indexes
    await db.knowledge_documents.create_index("name")
    await db.knowledge_documents.create_index("status")
    await db.knowledge_documents.create_index("category")
    await db.knowledge_documents.create_index([("created_at", -1)])
    await db.document_chunks.create_index("document_id")
    await db.kb_chat_sessions.create_index("user_id")
    await db.kb_chat_sessions.create_index([("updated_at", -1)])

    # Enrollment indexes
    await db.enrollments.create_index("enrollment_id", unique=True)
    await db.enrollments.create_index("employee_id")
    await db.enrollments.create_index("phone_number")
    await db.enrollments.create_index("service_partner")
    await db.enrollments.create_index("connect_status")
    await db.enrollments.create_index([("created_at", -1)])
    await db.enrollments.create_index("linked_lead_id")  # For enrollment-lead joins
    await db.enrollments.create_index("is_deleted")  # For soft delete filtering
    await db.enrollments.create_index([("assigned_to", 1), ("connect_status", 1)])  # For agent filtering

    # Additional Lead indexes for optimization
    await db.leads.create_index("is_deleted")  # For soft delete filtering

    # Additional Audit Log indexes
    await db.audit_logs.create_index("action")  # For action filtering

    # Enrollment Audit Log indexes
    await db.enrollment_audit_logs.create_index([("enrollment_id", 1), ("timestamp", -1)])
    await db.enrollment_audit_logs.create_index("user_id")
    await db.enrollment_audit_logs.create_index("action")

    # Dropdown Config indexes
    await db.dropdown_configs.create_index("field_name", unique=True)
    await db.dropdown_configs.create_index("category")

    logger.info("Database indexes created successfully")


def get_database():
    """Get database instance"""
    return db
