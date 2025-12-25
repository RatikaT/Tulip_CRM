import api from './api';
import {
  KnowledgeDocument,
  DocumentListResponse,
  DocumentUploadResponse,
  DocumentUpdateRequest,
  ChatResponse,
  ChatSession,
  ChatSessionDetail,
  SummaryResponse,
  DocumentCategory,
  DocumentStatus,
} from '../types/knowledge-base.types';

interface DocumentFilters {
  page?: number;
  per_page?: number;
  category?: DocumentCategory;
  status?: DocumentStatus;
  search?: string;
}

export const knowledgeBaseService = {
  // Document CRUD
  uploadDocument: async (
    file: File,
    name: string,
    category: DocumentCategory,
    description?: string
  ): Promise<DocumentUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const params = new URLSearchParams();
    params.append('name', name);
    params.append('category', category);
    if (description) params.append('description', description);

    const response = await api.post<DocumentUploadResponse>(
      `/knowledge-base/documents?${params.toString()}`,
      formData,
      {
        headers: {
          'Content-Type': undefined,
        },
      }
    );
    return response.data;
  },

  getDocuments: async (filters: DocumentFilters = {}): Promise<DocumentListResponse> => {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.per_page) params.append('per_page', filters.per_page.toString());
    if (filters.category) params.append('category', filters.category);
    if (filters.status) params.append('status', filters.status);
    if (filters.search) params.append('search', filters.search);

    const response = await api.get<DocumentListResponse>(
      `/knowledge-base/documents?${params.toString()}`
    );
    return response.data;
  },

  getDocument: async (documentId: string): Promise<KnowledgeDocument> => {
    const response = await api.get<KnowledgeDocument>(
      `/knowledge-base/documents/${documentId}`
    );
    return response.data;
  },

  updateDocument: async (
    documentId: string,
    data: DocumentUpdateRequest
  ): Promise<KnowledgeDocument> => {
    const response = await api.put<KnowledgeDocument>(
      `/knowledge-base/documents/${documentId}`,
      data
    );
    return response.data;
  },

  updateDocumentStatus: async (
    documentId: string,
    status: DocumentStatus
  ): Promise<KnowledgeDocument> => {
    const response = await api.patch<KnowledgeDocument>(
      `/knowledge-base/documents/${documentId}/status`,
      { status }
    );
    return response.data;
  },

  deleteDocument: async (documentId: string): Promise<void> => {
    await api.delete(`/knowledge-base/documents/${documentId}`);
  },

  downloadDocument: async (documentId: string): Promise<Blob> => {
    const response = await api.get(`/knowledge-base/documents/${documentId}/download`, {
      responseType: 'blob',
    });
    return response.data;
  },

  reprocessDocument: async (documentId: string): Promise<{ message: string }> => {
    const response = await api.post<{ message: string }>(
      `/knowledge-base/documents/${documentId}/reprocess`
    );
    return response.data;
  },

  // Chat
  chat: async (query: string, sessionId?: string): Promise<ChatResponse> => {
    const response = await api.post<ChatResponse>('/knowledge-base/chat', {
      query,
      session_id: sessionId,
    });
    return response.data;
  },

  // Chat Sessions
  getChatSessions: async (): Promise<{ sessions: ChatSession[]; total: number }> => {
    const response = await api.get<{ sessions: ChatSession[]; total: number }>(
      '/knowledge-base/chat/sessions'
    );
    return response.data;
  },

  getChatSession: async (sessionId: string): Promise<ChatSessionDetail> => {
    const response = await api.get<ChatSessionDetail>(
      `/knowledge-base/chat/sessions/${sessionId}`
    );
    return response.data;
  },

  deleteChatSession: async (sessionId: string): Promise<void> => {
    await api.delete(`/knowledge-base/chat/sessions/${sessionId}`);
  },

  // Summary
  generateSummary: async (documentId: string): Promise<SummaryResponse> => {
    const response = await api.post<SummaryResponse>(
      `/knowledge-base/documents/${documentId}/summary`
    );
    return response.data;
  },

  // Categories
  getCategories: async (): Promise<{ categories: string[] }> => {
    const response = await api.get<{ categories: string[] }>(
      '/knowledge-base/categories'
    );
    return response.data;
  },
};
