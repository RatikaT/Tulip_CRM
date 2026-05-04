import api from './api';
import {
  Enrollment,
  EnrollmentListResponse,
  EnrollmentCreateRequest,
  EnrollmentUpdateRequest,
  EnrollmentStatsResponse,
  FollowUpCreateRequest,
  BulkUploadResponse,
  EnrollmentAuditTrailResponse,
} from '../types/enrollment.types';

export interface EnrollmentQueryParams {
  page?: number;
  per_page?: number;
  search?: string;
  connect_status?: string[];
  action_taken?: string[];
  service_partner?: string[];
  uhid?: string[];
  hclhc_spoc?: string;
  created_date_from?: string;
  created_date_to?: string;
  next_follow_up_date?: string;
}

export const enrollmentService = {
  getEnrollments: async (params: EnrollmentQueryParams = {}): Promise<EnrollmentListResponse> => {
    const response = await api.get<EnrollmentListResponse>('/enrollments', { params });
    return response.data;
  },

  getEnrollment: async (enrollmentId: string): Promise<Enrollment> => {
    const response = await api.get<Enrollment>(`/enrollments/${enrollmentId}`);
    return response.data;
  },

  createEnrollment: async (data: EnrollmentCreateRequest): Promise<Enrollment> => {
    const response = await api.post<Enrollment>('/enrollments', data);
    return response.data;
  },

  updateEnrollment: async (enrollmentId: string, data: EnrollmentUpdateRequest): Promise<Enrollment> => {
    const response = await api.put<Enrollment>(`/enrollments/${enrollmentId}`, data);
    return response.data;
  },

  deleteEnrollment: async (enrollmentId: string): Promise<void> => {
    await api.delete(`/enrollments/${enrollmentId}`);
  },

  addFollowUp: async (enrollmentId: string, data: FollowUpCreateRequest): Promise<Enrollment> => {
    const response = await api.post<Enrollment>(`/enrollments/${enrollmentId}/follow-ups`, data);
    return response.data;
  },

  getStats: async (): Promise<EnrollmentStatsResponse> => {
    const response = await api.get<EnrollmentStatsResponse>('/enrollments/stats');
    return response.data;
  },

  bulkUpload: async (file: File): Promise<BulkUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<BulkUploadResponse>('/enrollments/bulk-upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  exportExcel: async (): Promise<Blob> => {
    const response = await api.get('/enrollments/export/excel', {
      responseType: 'blob',
    });
    return response.data;
  },

  getAuditTrail: async (enrollmentId: string): Promise<EnrollmentAuditTrailResponse> => {
    const response = await api.get<EnrollmentAuditTrailResponse>(`/enrollments/${enrollmentId}/audit`);
    return response.data;
  },
};
