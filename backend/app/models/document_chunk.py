"""
Document Chunk Model for RAG embeddings
"""
from datetime import datetime
from typing import List, Optional
from beanie import Document, Indexed
from pydantic import Field


class DocumentChunk(Document):
    """Chunked text with embeddings for vector search"""

    document_id: Indexed(str)  # Reference to KnowledgeDocument
    document_name: str

    # Chunk details
    chunk_index: int
    chunk_text: str
    chunk_size: int  # Character count

    # Embedding vector (768 dimensions for Gemini embeddings)
    embedding: List[float] = Field(default_factory=list)

    # Metadata for retrieval
    page_number: Optional[int] = None
    section_title: Optional[str] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "document_chunks"
