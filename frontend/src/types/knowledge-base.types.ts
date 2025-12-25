// Knowledge Base Types

export type DocumentStatus = 'draft' | 'published';

export type DocumentCategory =
  | 'Policy'
  | 'Procedure'
  | 'Training'
  | 'FAQ'
  | 'Product'
  | 'General';

export interface KnowledgeDocument {
  id: string;
  name: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  category: DocumentCategory;
  description: string | null;
  tags: string[];
  status: DocumentStatus;
  is_processed: boolean;
  page_count: number | null;
  created_at: string;
  updated_at: string;
  created_by_name: string;
  published_at: string | null;
}

export interface DocumentListResponse {
  documents: KnowledgeDocument[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface DocumentUploadResponse {
  id: string;
  name: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  category: string;
  status: string;
  created_at: string;
  message: string;
}

export interface DocumentUpdateRequest {
  name?: string;
  category?: DocumentCategory;
  description?: string;
  tags?: string[];
}

export interface SourceReference {
  document_id: string;
  document_name: string;
  chunk_text: string;
  page_number: number | null;
  relevance_score: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources: SourceReference[];
  timestamp: string;
}

export interface ChatResponse {
  answer: string;
  sources: SourceReference[];
  session_id: string;
}

export interface ChatSession {
  id: string;
  user_name: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ChatSessionDetail {
  id: string;
  user_name: string;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
}

export interface SummaryResponse {
  document_id: string;
  document_name: string;
  summary: string;
}

export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  'Policy',
  'Procedure',
  'Training',
  'FAQ',
  'Product',
  'General',
];

export const DOCUMENT_STATUS_OPTIONS: { value: DocumentStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
];
