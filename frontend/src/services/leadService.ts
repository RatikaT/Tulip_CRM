import api from './api';
import {
  Lead,
  LeadListResponse,
  LeadCreateRequest,
  LeadUpdateRequest,
  CommentCreateRequest,
  Comment,
  AuditTrailResponse,
} from '../types/lead.types';

interface LeadFilters {
  page?: number;
  per_page?: number;
  status?: string;
  lead_source?: string;
  city?: string;
  assigned_to?: string;
  search?: string;
}

export const leadService = {
  getLeads: async (filters: LeadFilters = {}): Promise<LeadListResponse> => {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.per_page) params.append('per_page', filters.per_page.toString());
    if (filters.status) params.append('status', filters.status);
    if (filters.lead_source) params.append('lead_source', filters.lead_source);
    if (filters.city) params.append('city', filters.city);
    if (filters.assigned_to) params.append('assigned_to', filters.assigned_to);
    if (filters.search) params.append('search', filters.search);

    const response = await api.get<LeadListResponse>(`/leads?${params.toString()}`);
    return response.data;
  },

  getLead: async (leadId: string): Promise<Lead> => {
    const response = await api.get<Lead>(`/leads/${leadId}`);
    return response.data;
  },

  createLead: async (data: LeadCreateRequest): Promise<Lead> => {
    const response = await api.post<Lead>('/leads', data);
    return response.data;
  },

  updateLead: async (leadId: string, data: LeadUpdateRequest): Promise<Lead> => {
    const response = await api.put<Lead>(`/leads/${leadId}`, data);
    return response.data;
  },

  deleteLead: async (leadId: string): Promise<void> => {
    await api.delete(`/leads/${leadId}`);
  },

  addComment: async (leadId: string, data: CommentCreateRequest): Promise<{ message: string; comment: Comment }> => {
    const response = await api.post<{ message: string; comment: Comment }>(`/leads/${leadId}/comments`, data);
    return response.data;
  },

  getAuditTrail: async (leadId: string): Promise<AuditTrailResponse> => {
    const response = await api.get<AuditTrailResponse>(`/leads/${leadId}/audit`);
    return response.data;
  },
};
