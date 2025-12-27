import api from './api';
import {
  AgentActivityResponse,
  Summary,
  CreateSummaryRequest,
  SummaryType,
} from '../types/summary.types';

interface SummariesResponse {
  summaries: Summary[];
}

interface SaveSummaryResponse {
  id: string;
  message: string;
}

export const dashboardService = {
  /**
   * Get agent activity for a specific date
   */
  async getAgentActivity(agentId: string, date: string): Promise<AgentActivityResponse> {
    const response = await api.get<AgentActivityResponse>('/dashboard/agent-activity', {
      params: { agent_id: agentId, date },
    });
    return response.data;
  },

  /**
   * Get stored summaries
   */
  async getSummaries(params?: {
    limit?: number;
    agent_id?: string;
    summary_type?: SummaryType;
  }): Promise<Summary[]> {
    const response = await api.get<SummariesResponse>('/dashboard/summaries', { params });
    return response.data.summaries;
  },

  /**
   * Save a summary
   */
  async saveSummary(request: CreateSummaryRequest): Promise<SaveSummaryResponse> {
    const response = await api.post<SaveSummaryResponse>('/dashboard/summaries', request);
    return response.data;
  },

  /**
   * Delete a summary (admin only)
   */
  async deleteSummary(summaryId: string): Promise<void> {
    await api.delete(`/dashboard/summaries/${summaryId}`);
  },

  /**
   * Get summary data for AI generation
   */
  async getSummaryData(params: {
    summary_type?: string;
    agent_id?: string;
    date_from?: string;
    date_to?: string;
  }): Promise<{
    total_leads: number;
    status_distribution: Record<string, number>;
    source_distribution: Record<string, number>;
    service_distribution: Record<string, number>;
    agent_name?: string;
    date_range: { from?: string; to?: string };
  }> {
    const response = await api.get('/dashboard/summary-data', { params });
    return response.data;
  },
};
