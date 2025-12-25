"""
Chat Session Model for Knowledge Base Q&A
"""
from datetime import datetime
from typing import List, Optional
from beanie import Document, Indexed
from pydantic import Field, BaseModel


class SourceReference(BaseModel):
    """Reference to source document chunk"""
    document_id: str
    document_name: str
    chunk_text: str
    page_number: Optional[int] = None
    relevance_score: float = 0.0


class ChatMessage(BaseModel):
    """Individual chat message"""
    role: str  # "user" or "assistant"
    content: str
    sources: List[SourceReference] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ChatSession(Document):
    """Knowledge Base chat session"""

    user_id: Indexed(str)
    user_name: str

    messages: List[ChatMessage] = Field(default_factory=list)

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "kb_chat_sessions"
