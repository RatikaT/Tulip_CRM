"""
Knowledge Base Schemas
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from app.models.knowledge_document import DocumentStatus, DocumentCategory


# Document Schemas
class DocumentUploadResponse(BaseModel):
    id: str
    name: str
    original_filename: str
    file_type: str
    file_size: int
    category: str
    status: str
    created_at: datetime
    message: str


class DocumentUpdateRequest(BaseModel):
    name: Optional[str] = None
    category: Optional[DocumentCategory] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None


class DocumentStatusUpdateRequest(BaseModel):
    status: DocumentStatus


class DocumentResponse(BaseModel):
    id: str
    name: str
    original_filename: str
    file_type: str
    file_size: int
    category: str
    description: Optional[str]
    tags: List[str]
    status: str
    is_processed: bool
    page_count: Optional[int]
    created_at: datetime
    updated_at: datetime
    created_by_name: str
    published_at: Optional[datetime]


class DocumentListResponse(BaseModel):
    documents: List[DocumentResponse]
    total: int
    page: int
    per_page: int
    pages: int


# Chat Schemas
class ChatQueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    session_id: Optional[str] = None


class ChatSourceReference(BaseModel):
    document_id: str
    document_name: str
    chunk_text: str
    page_number: Optional[int]
    relevance_score: float


class ChatResponse(BaseModel):
    answer: str
    sources: List[ChatSourceReference]
    session_id: str


class ChatSessionResponse(BaseModel):
    id: str
    user_name: str
    message_count: int
    created_at: datetime
    updated_at: datetime


class ChatSessionListResponse(BaseModel):
    sessions: List[ChatSessionResponse]
    total: int


# Summary Schemas
class SummaryRequest(BaseModel):
    document_id: str


class SummaryResponse(BaseModel):
    document_id: str
    document_name: str
    summary: str


# Categories
class CategoriesResponse(BaseModel):
    categories: List[str]
