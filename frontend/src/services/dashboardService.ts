import api from './api';
import { SpocReport, SpocReportParams, Summary, SummaryType } from '../types/summary.types';

function cleanParams(p: SpocReportParams) {
  return { start: p.start, end: p.end, ...(p.user_id ? { user_id: p.user_id } : {}) };
}

export const dashboardService = {
  /** Daily SPOC Report - one fetch serves the whole Summaries page. */
  async getSpocReport(params: SpocReportParams): Promise<SpocReport> {
    const response = await api.get<SpocReport>('/dashboard/spoc-report', { params: cleanParams(params) });
    return response.data;
  },

  /** Download the SPOC report MIS (.xlsx). Saves the file in the browser. */
  async downloadSpocReport(params: SpocReportParams): Promise<void> {
    const response = await api.get('/dashboard/spoc-report/export', {
      params: cleanParams(params),
      responseType: 'blob',
    });
    const cd: string | undefined = response.headers['content-disposition'];
    let filename = `spoc_report_${params.start}_${params.end}.xlsx`;
    const match = cd?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    if (match) filename = decodeURIComponent(match[1].trim());
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  /** Short AI-written note on the report (server-side; numbers come from the server). */
  async getSpocAiNote(params: SpocReportParams): Promise<string> {
    const response = await api.post<{ note: string }>('/dashboard/spoc-report/ai-note', {
      start: params.start,
      end: params.end,
      user_id: params.user_id || null,
    });
    return response.data.note || '';
  },

  /** Save the report's numbers plus the AI note (admin only). */
  async saveSpocReport(params: SpocReportParams, note: string): Promise<{ id: string; message: string }> {
    const response = await api.post<{ id: string; message: string }>('/dashboard/spoc-report/save', {
      start: params.start,
      end: params.end,
      user_id: params.user_id || null,
      note: note || null,
    });
    return response.data;
  },

  /** Stored summaries / saved reports. */
  async getSummaries(params?: { limit?: number; agent_id?: string; summary_type?: SummaryType }): Promise<Summary[]> {
    const response = await api.get<{ summaries: Summary[] }>('/dashboard/summaries', { params });
    return response.data.summaries || [];
  },

  /** Delete a summary (admin only). */
  async deleteSummary(summaryId: string): Promise<void> {
    await api.delete(`/dashboard/summaries/${summaryId}`);
  },
};
