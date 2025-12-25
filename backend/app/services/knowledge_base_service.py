"""
Knowledge Base Service
Handles document processing, text extraction, chunking, embeddings, and RAG Q&A
"""
import os
import uuid
import logging
import numpy as np
from typing import List, Optional, Tuple
from datetime import datetime
import csv
import io

import fitz  # PyMuPDF
from docx import Document as DocxDocument
import google.generativeai as genai

from app.config import settings
from app.models.knowledge_document import KnowledgeDocument, DocumentStatus
from app.models.document_chunk import DocumentChunk
from app.models.chat_session import ChatSession, ChatMessage, SourceReference

logger = logging.getLogger(__name__)

# Configure Gemini
if settings.GEMINI_API_KEY:
    genai.configure(api_key=settings.GEMINI_API_KEY)


def ensure_upload_dir():
    """Ensure the upload directory exists"""
    os.makedirs(settings.KB_UPLOADS_DIR, exist_ok=True)


def generate_file_path(original_filename: str) -> str:
    """Generate unique file path for uploaded file"""
    ensure_upload_dir()
    file_ext = os.path.splitext(original_filename)[1].lower()
    unique_name = f"{uuid.uuid4()}{file_ext}"
    return os.path.join(settings.KB_UPLOADS_DIR, unique_name)


async def save_uploaded_file(file_content: bytes, file_path: str) -> None:
    """Save uploaded file to disk"""
    ensure_upload_dir()
    with open(file_path, "wb") as f:
        f.write(file_content)


def get_file_type(filename: str) -> str:
    """Get file type from filename"""
    ext = os.path.splitext(filename)[1].lower()
    type_map = {
        ".pdf": "pdf",
        ".docx": "docx",
        ".doc": "doc",
        ".csv": "csv",
    }
    return type_map.get(ext, "unknown")


def extract_text_from_pdf(file_path: str) -> Tuple[str, int]:
    """Extract text from PDF file"""
    try:
        doc = fitz.open(file_path)
        text = ""
        for page in doc:
            text += page.get_text() + "\n"
        page_count = len(doc)
        doc.close()
        return text.strip(), page_count
    except Exception as e:
        logger.error(f"Error extracting text from PDF: {e}")
        raise


def extract_text_from_docx(file_path: str) -> Tuple[str, int]:
    """Extract text from DOCX file"""
    try:
        doc = DocxDocument(file_path)
        text = "\n".join([para.text for para in doc.paragraphs])
        # Estimate pages (rough calculation)
        page_count = max(1, len(text) // 3000)
        return text.strip(), page_count
    except Exception as e:
        logger.error(f"Error extracting text from DOCX: {e}")
        raise


def extract_text_from_csv(file_path: str) -> Tuple[str, int]:
    """Extract text from CSV file"""
    try:
        with open(file_path, "r", encoding="utf-8-sig") as f:
            reader = csv.reader(f)
            rows = list(reader)
            text = "\n".join([", ".join(row) for row in rows])
        page_count = max(1, len(rows) // 50)
        return text.strip(), page_count
    except Exception as e:
        logger.error(f"Error extracting text from CSV: {e}")
        raise


def extract_text(file_path: str, file_type: str) -> Tuple[str, int]:
    """Extract text from file based on type"""
    if file_type == "pdf":
        return extract_text_from_pdf(file_path)
    elif file_type in ["docx", "doc"]:
        return extract_text_from_docx(file_path)
    elif file_type == "csv":
        return extract_text_from_csv(file_path)
    else:
        raise ValueError(f"Unsupported file type: {file_type}")


def chunk_text(
    text: str,
    chunk_size: int = None,
    overlap: int = None
) -> List[dict]:
    """
    Split text into overlapping chunks for better context preservation.
    """
    chunk_size = chunk_size or settings.KB_CHUNK_SIZE
    overlap = overlap or settings.KB_CHUNK_OVERLAP

    if not text:
        return []

    chunks = []
    start = 0
    chunk_index = 0

    while start < len(text):
        end = start + chunk_size

        # Extract chunk
        chunk_text = text[start:end]

        # Try to break at sentence boundary if not at end of text
        if end < len(text):
            # Look for sentence endings
            for sep in [". ", ".\n", "? ", "!\n"]:
                last_sep = chunk_text.rfind(sep)
                if last_sep > chunk_size // 2:
                    end = start + last_sep + len(sep)
                    chunk_text = text[start:end]
                    break

        chunk_text = chunk_text.strip()
        if chunk_text:
            chunks.append({
                "chunk_index": chunk_index,
                "chunk_text": chunk_text,
                "chunk_size": len(chunk_text)
            })
            chunk_index += 1

        start = end - overlap
        if start >= len(text):
            break

    return chunks


async def generate_embedding(text: str, task_type: str = "retrieval_document") -> List[float]:
    """Generate embedding using Gemini embedding model"""
    if not settings.GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not configured, returning empty embedding")
        return []

    try:
        result = genai.embed_content(
            model="models/embedding-001",
            content=text[:2000],  # Limit text length
            task_type=task_type
        )
        return result["embedding"]
    except Exception as e:
        logger.error(f"Error generating embedding: {e}")
        return []


async def process_document(document: KnowledgeDocument) -> bool:
    """
    Full document processing pipeline:
    1. Extract text
    2. Chunk text
    3. Generate embeddings for each chunk
    4. Store chunks in database
    """
    try:
        logger.info(f"Processing document: {document.name}")

        # Extract text
        extracted_text, page_count = extract_text(
            document.file_path,
            document.file_type
        )

        if not extracted_text:
            document.processing_error = "No text could be extracted"
            document.is_processed = False
            await document.save()
            return False

        # Update document with extracted text
        document.extracted_text = extracted_text
        document.page_count = page_count

        # Chunk text
        chunks = chunk_text(extracted_text)
        logger.info(f"Created {len(chunks)} chunks for document {document.name}")

        # Delete existing chunks for this document
        await DocumentChunk.find(
            DocumentChunk.document_id == str(document.id)
        ).delete()

        # Generate embeddings and store chunks
        for chunk_data in chunks:
            embedding = await generate_embedding(chunk_data["chunk_text"])

            chunk = DocumentChunk(
                document_id=str(document.id),
                document_name=document.name,
                chunk_index=chunk_data["chunk_index"],
                chunk_text=chunk_data["chunk_text"],
                chunk_size=chunk_data["chunk_size"],
                embedding=embedding
            )
            await chunk.insert()

        # Mark document as processed
        document.is_processed = True
        document.processing_error = None
        document.updated_at = datetime.utcnow()
        await document.save()

        logger.info(f"Successfully processed document: {document.name}")
        return True

    except Exception as e:
        logger.error(f"Error processing document {document.name}: {e}")
        document.processing_error = str(e)
        document.is_processed = False
        await document.save()
        return False


def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Calculate cosine similarity between two vectors"""
    if not vec1 or not vec2:
        return 0.0

    a = np.array(vec1)
    b = np.array(vec2)

    dot_product = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)

    if norm_a == 0 or norm_b == 0:
        return 0.0

    return float(dot_product / (norm_a * norm_b))


async def search_similar_chunks(
    query_embedding: List[float],
    top_k: int = None,
    published_only: bool = True
) -> List[dict]:
    """
    Search for similar document chunks.
    Only searches published documents for agents.
    """
    top_k = top_k or settings.KB_TOP_K_RESULTS

    # Get document IDs to search
    query = {"is_deleted": False}
    if published_only:
        query["status"] = DocumentStatus.PUBLISHED

    published_docs = await KnowledgeDocument.find(query).to_list()
    doc_ids = [str(doc.id) for doc in published_docs]

    if not doc_ids:
        return []

    # Get chunks from these documents
    chunks = await DocumentChunk.find(
        {"document_id": {"$in": doc_ids}}
    ).to_list()

    # Calculate similarities
    results = []
    for chunk in chunks:
        if chunk.embedding:
            similarity = cosine_similarity(query_embedding, chunk.embedding)
            results.append({
                "chunk": chunk,
                "similarity": similarity
            })

    # Sort by similarity and return top_k
    results.sort(key=lambda x: x["similarity"], reverse=True)
    return results[:top_k]


async def generate_answer(
    query: str,
    context_chunks: List[dict]
) -> str:
    """
    Generate answer using Gemini with retrieved context.
    STRICTLY answers from document content only.
    """
    if not settings.GEMINI_API_KEY:
        return "AI service is not configured. Please contact administrator."

    if not context_chunks:
        return "I cannot find any relevant information in the knowledge base documents for your query."

    # Build context from chunks
    context_parts = []
    for item in context_chunks:
        chunk = item["chunk"]
        context_parts.append(f"[Source: {chunk.document_name}]\n{chunk.chunk_text}")

    context = "\n\n---\n\n".join(context_parts)

    prompt = f"""You are a knowledge base assistant for Tulip Healthcare CRM.
Answer the user's question STRICTLY based on the provided document context below.
If the answer is not found in the context, say "• I cannot find information about this in the knowledge base documents."
Do NOT make up information or use external knowledge.

MANDATORY FORMAT: You MUST format your entire response as bullet points. Every piece of information must be a bullet point starting with "•". Example format:
• First point here
• Second point here
  • Sub-point if needed
• Third point here

CONTEXT FROM DOCUMENTS:
{context}

USER QUESTION: {query}

ANSWER (MUST be in bullet points starting with •):"""

    try:
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        logger.error(f"Error generating answer: {e}")
        return f"Error generating answer: {str(e)}"


async def generate_document_summary(document: KnowledgeDocument) -> str:
    """Generate a summary of the document"""
    if not settings.GEMINI_API_KEY:
        return "AI service is not configured. Please contact administrator."

    if not document.extracted_text:
        return "Document has not been processed yet."

    # Take first 10000 characters for summary
    text_to_summarize = document.extracted_text[:10000]

    prompt = f"""Summarize the following document in 3-5 paragraphs. Focus on the key points and main topics covered.

DOCUMENT TITLE: {document.name}
CATEGORY: {document.category.value}

DOCUMENT CONTENT:
{text_to_summarize}

SUMMARY:"""

    try:
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        logger.error(f"Error generating summary: {e}")
        return f"Error generating summary: {str(e)}"


async def chat_with_knowledge_base(
    query: str,
    user_id: str,
    user_name: str,
    session_id: Optional[str] = None,
    is_admin: bool = False
) -> Tuple[str, List[SourceReference], str]:
    """
    Process a chat query against the knowledge base.
    Returns: (answer, sources, session_id)
    """
    # Get or create chat session
    session = None
    if session_id:
        session = await ChatSession.get(session_id)
        if not session or session.user_id != user_id:
            session = None

    if not session:
        session = ChatSession(
            user_id=user_id,
            user_name=user_name
        )
        await session.insert()

    # Generate query embedding
    query_embedding = await generate_embedding(query, task_type="retrieval_query")

    # Search for similar chunks (admins can see all, agents only published)
    similar_chunks = await search_similar_chunks(
        query_embedding,
        published_only=not is_admin
    )

    # Generate answer
    answer = await generate_answer(query, similar_chunks)

    # Build source references
    sources = []
    for item in similar_chunks:
        chunk = item["chunk"]
        sources.append(SourceReference(
            document_id=chunk.document_id,
            document_name=chunk.document_name,
            chunk_text=chunk.chunk_text[:200] + "..." if len(chunk.chunk_text) > 200 else chunk.chunk_text,
            page_number=chunk.page_number,
            relevance_score=item["similarity"]
        ))

    # Add messages to session
    user_message = ChatMessage(role="user", content=query)
    assistant_message = ChatMessage(role="assistant", content=answer, sources=sources)

    session.messages.append(user_message)
    session.messages.append(assistant_message)
    session.updated_at = datetime.utcnow()
    await session.save()

    return answer, sources, str(session.id)


async def delete_document_data(document_id: str) -> None:
    """Delete all chunks associated with a document"""
    await DocumentChunk.find(
        DocumentChunk.document_id == document_id
    ).delete()
