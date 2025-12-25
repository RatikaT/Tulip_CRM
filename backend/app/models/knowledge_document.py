"""
Knowledge Base Document Model
"""
from datetime import datetime
from typing import Optional, List
from beanie import Document, Indexed
from pydantic import Field
from enum import Enum


class DocumentStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"


class DocumentCategory(str, Enum):
    POLICY = "Policy"
    PROCEDURE = "Procedure"
    TRAINING = "Training"
    FAQ = "FAQ"
    PRODUCT = "Product"
    GENERAL = "General"


class KnowledgeDocument(Document):
    """Knowledge Base Document model for storing uploaded documents"""

    # Document metadata
    name: Indexed(str)
    original_filename: str
    file_type: str  # pdf, docx, csv
    file_path: str  # Path in uploads/ folder
    file_size: int  # Size in bytes

    # Categorization
    category: DocumentCategory = DocumentCategory.GENERAL
    description: Optional[str] = None
    tags: List[str] = Field(default_factory=list)

    # Status workflow: Draft -> Published
    status: DocumentStatus = DocumentStatus.DRAFT
    published_at: Optional[datetime] = None
    published_by: Optional[str] = None

    # Content extraction
    extracted_text: Optional[str] = None
    page_count: Optional[int] = None
    is_processed: bool = False
    processing_error: Optional[str] = None

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str
    created_by_name: str

    # Soft delete
    is_deleted: bool = False

    class Settings:
        name = "knowledge_documents"
        use_state_management = True
