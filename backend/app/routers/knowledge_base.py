"""
Knowledge Base Routes
Document management, RAG search, and chat functionality
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query, UploadFile, File
from fastapi.responses import FileResponse
from typing import Optional, List
from datetime import datetime
import os
import math
import logging
import re

from app.models.knowledge_document import KnowledgeDocument, DocumentStatus, DocumentCategory
from app.models.document_chunk import DocumentChunk
from app.models.chat_session import ChatSession
from app.schemas.knowledge_base import (
    DocumentUploadResponse,
    DocumentUpdateRequest,
    DocumentStatusUpdateRequest,
    DocumentResponse,
    DocumentListResponse,
    ChatQueryRequest,
    ChatResponse,
    ChatSourceReference,
    ChatSessionResponse,
    ChatSessionListResponse,
    SummaryRequest,
    SummaryResponse,
    CategoriesResponse
)
from app.services import knowledge_base_service as kb_service
from app.middleware.auth_middleware import get_current_user, get_current_admin
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


def document_to_response(doc: KnowledgeDocument) -> DocumentResponse:
    """Convert KnowledgeDocument to response"""
    return DocumentResponse(
        id=str(doc.id),
        name=doc.name,
        original_filename=doc.original_filename,
        file_type=doc.file_type,
        file_size=doc.file_size,
        category=doc.category.value,
        description=doc.description,
        tags=doc.tags,
        status=doc.status.value,
        is_processed=doc.is_processed,
        page_count=doc.page_count,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        created_by_name=doc.created_by_name,
        published_at=doc.published_at
    )


# ============ Document Management (Admin) ============

@router.post("/documents", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    name: str = Query(..., min_length=1, max_length=200),
    category: DocumentCategory = Query(default=DocumentCategory.GENERAL),
    description: Optional[str] = Query(default=None, max_length=1000),
    current_user: dict = Depends(get_current_admin)
):
    """
    Upload a new document to the knowledge base (Admin only)
    Supported formats: PDF, DOCX, DOC, CSV
    """
    # Validate file type
    file_type = kb_service.get_file_type(file.filename)
    if file_type == "unknown":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type. Allowed: PDF, DOCX, DOC, CSV"
        )

    # Validate file size
    content = await file.read()
    file_size = len(content)
    max_size = settings.KB_MAX_FILE_SIZE_MB * 1024 * 1024

    if file_size > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {settings.KB_MAX_FILE_SIZE_MB}MB"
        )

    # Generate file path and save
    file_path = kb_service.generate_file_path(file.filename)
    await kb_service.save_uploaded_file(content, file_path)

    # Create document record
    document = KnowledgeDocument(
        name=name,
        original_filename=file.filename,
        file_type=file_type,
        file_path=file_path,
        file_size=file_size,
        category=category,
        description=description,
        created_by=current_user["user_id"],
        created_by_name=current_user["full_name"]
    )
    await document.insert()

    logger.info(f"Document uploaded: {name} by {current_user['full_name']}")

    # Process document in background (extract text, chunk, embed)
    try:
        await kb_service.process_document(document)
    except Exception as e:
        logger.error(f"Error processing document: {e}")
        # Document is saved, processing error is logged in document

    return DocumentUploadResponse(
        id=str(document.id),
        name=document.name,
        original_filename=document.original_filename,
        file_type=document.file_type,
        file_size=document.file_size,
        category=document.category.value,
        status=document.status.value,
        created_at=document.created_at,
        message="Document uploaded successfully. Processing in progress."
    )


@router.get("/documents", response_model=DocumentListResponse)
async def list_documents(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    category: Optional[DocumentCategory] = Query(default=None),
    status_filter: Optional[DocumentStatus] = Query(default=None, alias="status"),
    search: Optional[str] = Query(default=None, max_length=100),
    current_user: dict = Depends(get_current_user)
):
    """
    List documents in knowledge base
    Agents see only published documents, Admins see all
    """
    is_admin = current_user.get("role") in ["admin", "super_admin"]

    # Build query
    query = {"is_deleted": False}

    # Agents can only see published documents
    if not is_admin:
        query["status"] = DocumentStatus.PUBLISHED

    if category:
        query["category"] = category

    if status_filter and is_admin:
        query["status"] = status_filter

    if search:
        query["name"] = {"$regex": re.escape(search), "$options": "i"}

    # Get total count
    total = await KnowledgeDocument.find(query).count()
    pages = math.ceil(total / per_page) if total > 0 else 1

    # Get documents with pagination
    skip = (page - 1) * per_page
    documents = await KnowledgeDocument.find(query).sort(
        [("created_at", -1)]
    ).skip(skip).limit(per_page).to_list()

    return DocumentListResponse(
        documents=[document_to_response(doc) for doc in documents],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages
    )


@router.get("/documents/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get document details"""
    document = await KnowledgeDocument.get(document_id)

    if not document or document.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )

    # Check access for agents
    is_admin = current_user.get("role") in ["admin", "super_admin"]
    if not is_admin and document.status != DocumentStatus.PUBLISHED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Document not published."
        )

    return document_to_response(document)


@router.put("/documents/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: str,
    update_data: DocumentUpdateRequest,
    current_user: dict = Depends(get_current_admin)
):
    """Update document metadata (Admin only)"""
    document = await KnowledgeDocument.get(document_id)

    if not document or document.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )

    # Update fields
    if update_data.name is not None:
        document.name = update_data.name
    if update_data.category is not None:
        document.category = update_data.category
    if update_data.description is not None:
        document.description = update_data.description
    if update_data.tags is not None:
        document.tags = update_data.tags

    document.updated_at = datetime.utcnow()
    await document.save()

    logger.info(f"Document updated: {document.name} by {current_user['full_name']}")

    return document_to_response(document)


@router.patch("/documents/{document_id}/status", response_model=DocumentResponse)
async def update_document_status(
    document_id: str,
    status_update: DocumentStatusUpdateRequest,
    current_user: dict = Depends(get_current_admin)
):
    """Publish or unpublish a document (Admin only)"""
    document = await KnowledgeDocument.get(document_id)

    if not document or document.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )

    # Check if document is processed before publishing
    if status_update.status == DocumentStatus.PUBLISHED and not document.is_processed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot publish document. Processing not complete."
        )

    document.status = status_update.status
    document.updated_at = datetime.utcnow()

    if status_update.status == DocumentStatus.PUBLISHED:
        document.published_at = datetime.utcnow()

    await document.save()

    logger.info(f"Document status changed to {status_update.status.value}: {document.name} by {current_user['full_name']}")

    return document_to_response(document)


@router.delete("/documents/{document_id}")
async def delete_document(
    document_id: str,
    current_user: dict = Depends(get_current_admin)
):
    """Soft delete a document (Admin only)"""
    document = await KnowledgeDocument.get(document_id)

    if not document or document.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )

    # Soft delete
    document.is_deleted = True
    document.updated_at = datetime.utcnow()
    await document.save()

    # Delete associated chunks
    await kb_service.delete_document_data(document_id)

    # Delete physical file
    if os.path.exists(document.file_path):
        try:
            os.remove(document.file_path)
        except Exception as e:
            logger.error(f"Error deleting file: {e}")

    logger.info(f"Document deleted: {document.name} by {current_user['full_name']}")

    return {"message": "Document deleted successfully"}


@router.get("/documents/{document_id}/download")
async def download_document(
    document_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Download document file"""
    document = await KnowledgeDocument.get(document_id)

    if not document or document.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )

    # Check access for agents
    is_admin = current_user.get("role") in ["admin", "super_admin"]
    if not is_admin and document.status != DocumentStatus.PUBLISHED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Document not published."
        )

    if not os.path.exists(document.file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found on server"
        )

    return FileResponse(
        path=document.file_path,
        filename=document.original_filename,
        media_type="application/octet-stream"
    )


@router.post("/documents/{document_id}/reprocess")
async def reprocess_document(
    document_id: str,
    current_user: dict = Depends(get_current_admin)
):
    """Reprocess a document (Admin only)"""
    document = await KnowledgeDocument.get(document_id)

    if not document or document.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )

    # Reset processing status
    document.is_processed = False
    document.processing_error = None
    await document.save()

    # Reprocess
    success = await kb_service.process_document(document)

    if success:
        return {"message": "Document reprocessed successfully"}
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Processing failed: {document.processing_error}"
        )


# ============ Chat & Q&A ============

@router.post("/chat", response_model=ChatResponse)
async def chat_with_kb(
    request: ChatQueryRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Chat with the knowledge base using RAG
    Returns answers strictly from document content
    """
    try:
        is_admin = current_user.get("role") in ["admin", "super_admin"]

        answer, sources, session_id = await kb_service.chat_with_knowledge_base(
            query=request.query,
            user_id=current_user["user_id"],
            user_name=current_user["full_name"],
            session_id=request.session_id,
            is_admin=is_admin
        )

        return ChatResponse(
            answer=answer,
            sources=[
                ChatSourceReference(
                    document_id=src.document_id,
                    document_name=src.document_name,
                    chunk_text=src.chunk_text,
                    page_number=src.page_number,
                    relevance_score=src.relevance_score
                )
                for src in sources
            ],
            session_id=session_id
        )
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Chat error: {str(e)}"
        )


@router.post("/documents/{document_id}/summary", response_model=SummaryResponse)
async def generate_document_summary(
    document_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Generate AI summary of a document"""
    document = await KnowledgeDocument.get(document_id)

    if not document or document.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )

    # Check access for agents
    is_admin = current_user.get("role") in ["admin", "super_admin"]
    if not is_admin and document.status != DocumentStatus.PUBLISHED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Document not published."
        )

    if not document.is_processed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document not yet processed"
        )

    summary = await kb_service.generate_document_summary(document)

    return SummaryResponse(
        document_id=document_id,
        document_name=document.name,
        summary=summary
    )


# ============ Chat Sessions ============

@router.get("/chat/sessions", response_model=ChatSessionListResponse)
async def list_chat_sessions(
    current_user: dict = Depends(get_current_user)
):
    """List user's chat sessions"""
    sessions = await ChatSession.find(
        ChatSession.user_id == current_user["user_id"]
    ).sort([("updated_at", -1)]).limit(20).to_list()

    return ChatSessionListResponse(
        sessions=[
            ChatSessionResponse(
                id=str(session.id),
                user_name=session.user_name,
                message_count=len(session.messages),
                created_at=session.created_at,
                updated_at=session.updated_at
            )
            for session in sessions
        ],
        total=len(sessions)
    )


@router.get("/chat/sessions/{session_id}")
async def get_chat_session(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get chat session with full history"""
    session = await ChatSession.get(session_id)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )

    # Verify ownership
    if session.user_id != current_user["user_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )

    return {
        "id": str(session.id),
        "user_name": session.user_name,
        "messages": [
            {
                "role": msg.role,
                "content": msg.content,
                "sources": [
                    {
                        "document_id": src.document_id,
                        "document_name": src.document_name,
                        "chunk_text": src.chunk_text,
                        "page_number": src.page_number,
                        "relevance_score": src.relevance_score
                    }
                    for src in msg.sources
                ],
                "timestamp": msg.timestamp
            }
            for msg in session.messages
        ],
        "created_at": session.created_at,
        "updated_at": session.updated_at
    }


@router.delete("/chat/sessions/{session_id}")
async def delete_chat_session(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a chat session"""
    session = await ChatSession.get(session_id)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )

    # Verify ownership
    if session.user_id != current_user["user_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )

    await session.delete()

    return {"message": "Session deleted successfully"}


# ============ Utilities ============

@router.get("/categories", response_model=CategoriesResponse)
async def get_categories(
    current_user: dict = Depends(get_current_user)
):
    """Get list of document categories"""
    return CategoriesResponse(
        categories=[cat.value for cat in DocumentCategory]
    )
