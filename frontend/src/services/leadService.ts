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
  search?: string;
  status?: string[];
  lead_source?: string[];
  uhid?: string[];
  package_requested?: string[];
  service_requested?: string[];
  city?: string;
  assigned_to?: string;
  reassign_to?: string;
  created_date_from?: string;
  created_date_to?: string;
  next_follow_up_date?: string;
  assigned_today?: boolean;
}

interface LeadStatsResponse {
  total: number;
  new_today: number;
  follow_up_today: number;
  assigned_today: number;
}

export interface DuplicateScanResponse {
  message: string;
  flagged: number;
}

export interface DuplicateItem {
  lead: Lead;
  primary: Lead | null;
  matched_on: string[];
  resolved_by_name?: string | null;
}

export interface DuplicatesResponse {
  duplicates: DuplicateItem[];
  total: number;
}

export interface DuplicatesSummary {
  active_leads: number;
  pending: number;
  confirmed: number;
  total: number;
}

export type DuplicateState = 'pending' | 'confirmed' | 'all';

export type RelatedLead = Lead & { matched_on: string[] };

export interface RelatedLeadsResponse {
  related: RelatedLead[];
  total: number;
}

export const leadService = {
  getLeads: async (filters: LeadFilters = {}): Promise<LeadListResponse> => {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.per_page) params.append('per_page', filters.per_page.toString());
    if (filters.search && filters.search.trim()) params.append('search', filters.search.trim());
    // Multi-select filters - append each value separately
    if (filters.status && filters.status.length > 0) {
      filters.status.forEach(s => params.append('status', s));
    }
    if (filters.lead_source && filters.lead_source.length > 0) {
      filters.lead_source.forEach(s => params.append('lead_source', s));
    }
    if (filters.uhid && filters.uhid.length > 0) {
      filters.uhid.forEach(u => params.append('uhid', u));
    }
    if (filters.package_requested && filters.package_requested.length > 0) {
      filters.package_requested.forEach(p => params.append('package_requested', p));
    }
    // Single value filters
    if (filters.city) params.append('city', filters.city);
    if (filters.assigned_to) params.append('assigned_to', filters.assigned_to);
    if (filters.reassign_to) params.append('reassign_to', filters.reassign_to);
    // Date filters
    if (filters.created_date_from) params.append('created_date_from', filters.created_date_from);
    if (filters.created_date_to) params.append('created_date_to', filters.created_date_to);
    if (filters.next_follow_up_date) params.append('next_follow_up_date', filters.next_follow_up_date);
    if (filters.assigned_today) params.append('assigned_today', 'true');

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

  bulkDeleteLeads: async (leadIds: string[]): Promise<{ message: string; deleted_count: number }> => {
    const response = await api.post<{ message: string; deleted_count: number }>('/leads/bulk-delete', { lead_ids: leadIds });
    return response.data;
  },

  // Super-admin one-click: build outreach journeys for existing closed leads that
  // don't have one (e.g. leads closed before the outreach feature existed).
  backfillOutreach: async (): Promise<{
    message: string;
    checked: number;
    built: number;
    skipped_has_journey: number;
    skipped_no_template: number;
  }> => {
    const response = await api.post('/leads/outreach/backfill');
    return response.data;
  },

  addComment: async (leadId: string, data: CommentCreateRequest): Promise<{ message: string; comment: Comment }> => {
    const response = await api.post<{ message: string; comment: Comment }>(`/leads/${leadId}/comments`, data);
    return response.data;
  },

  getAuditTrail: async (leadId: string): Promise<AuditTrailResponse> => {
    const response = await api.get<AuditTrailResponse>(`/leads/${leadId}/audit`);
    return response.data;
  },

  scanDuplicates: async (): Promise<DuplicateScanResponse> => {
    const response = await api.post<DuplicateScanResponse>('/leads/dedup/scan');
    return response.data;
  },

  getDuplicatesSummary: async (): Promise<DuplicatesSummary> => {
    const response = await api.get<DuplicatesSummary>('/leads/duplicates/summary');
    return response.data;
  },

  getDuplicates: async (state: DuplicateState = 'pending'): Promise<DuplicatesResponse> => {
    const response = await api.get<DuplicatesResponse>(`/leads/duplicates?state=${state}`);
    return response.data;
  },

  resolveDuplicate: async (keepLeadId: string, removeLeadId: string): Promise<{ message: string }> => {
    const response = await api.post<{ message: string }>('/leads/duplicate/resolve', {
      keep_lead_id: keepLeadId,
      remove_lead_id: removeLeadId,
    });
    return response.data;
  },

  dismissDuplicate: async (leadId: string): Promise<{ message: string }> => {
    const response = await api.post<{ message: string }>(`/leads/${leadId}/duplicate/dismiss`);
    return response.data;
  },

  restoreDuplicate: async (leadId: string): Promise<{ message: string }> => {
    const response = await api.post<{ message: string }>(`/leads/${leadId}/duplicate/restore`);
    return response.data;
  },

  getRelatedLeads: async (leadId: string): Promise<RelatedLeadsResponse> => {
    const response = await api.get<RelatedLeadsResponse>(`/leads/${leadId}/related`);
    return response.data;
  },

  getStats: async (): Promise<LeadStatsResponse> => {
    console.log('leadService.getStats: Making request to /leads/stats');
    try {
      const response = await api.get<LeadStatsResponse>('/leads/stats');
      console.log('leadService.getStats: Response:', response.data);
      return response.data;
    } catch (error) {
      console.error('leadService.getStats: Error:', error);
      throw error;
    }
  },
};
