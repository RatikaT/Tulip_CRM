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
  AddServiceRequest,
  CustomerServicesResponse,
  BirthdaysTodayResponse,
} from '../types/enrollment.types';

export interface EnrollmentQueryParams {
  page?: number;
  per_page?: number;
  search?: string;
  connect_status?: string[];
  action_taken?: string[];
  service_partner?: string[];
  service_enrolled?: string[];
  package?: string;
  uhid?: string[];
  hclhc_spoc?: string;
  created_date_from?: string;
  created_date_to?: string;
  next_follow_up_date?: string;
  assigned_today?: boolean;
  my_role?: 'following_up' | 'enrolled';
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

  exportExcel: async (startDate?: string, endDate?: string): Promise<Blob> => {
    const params: Record<string, string> = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    const response = await api.get('/enrollments/export/excel', {
      responseType: 'blob',
      params,
    });
    return response.data;
  },

  getAuditTrail: async (enrollmentId: string): Promise<EnrollmentAuditTrailResponse> => {
    const response = await api.get<EnrollmentAuditTrailResponse>(`/enrollments/${enrollmentId}/audit`);
    return response.data;
  },

  // Add an additional service to an already-enrolled customer (creates a new
  // linked enrollment sharing the customer_group_id).
  addService: async (enrollmentId: string, data: AddServiceRequest): Promise<Enrollment> => {
    const response = await api.post<Enrollment>(`/enrollments/${enrollmentId}/add-service`, data);
    return response.data;
  },

  // All services (enrollments) belonging to the same customer.
  getCustomerServices: async (enrollmentId: string): Promise<CustomerServicesResponse> => {
    const response = await api.get<CustomerServicesResponse>(`/enrollments/${enrollmentId}/services`);
    return response.data;
  },

  // Enrolled customers whose birthday is today (IST) — scoped per role on the server.
  getBirthdaysToday: async (): Promise<BirthdaysTodayResponse> => {
    const response = await api.get<BirthdaysTodayResponse>('/enrollments/birthdays-today');
    return response.data;
  },

  // Super-admin one-time fix: fill blank HCLHC SPOCs from the enrolling agent.
  backfillSpoc: async (): Promise<{
    message: string;
    checked: number;
    updated: number;
    assigned_filled: number;
    skipped_no_creator: number;
  }> => {
    const response = await api.post('/enrollments/backfill-spoc');
    return response.data;
  },

  // Super-admin one-click: fill source on enrollments converted from a lead that
  // don't have a source yet (copies from the linked lead).
  backfillSource: async (): Promise<{
    message: string;
    checked: number;
    updated: number;
    skipped_no_source: number;
  }> => {
    const response = await api.post('/enrollments/backfill-source');
    return response.data;
  },

  // Super-admin one-click: build care journeys for existing enrolled leads that
  // don't have one (resolves legacy service values to the right template).
  backfillJourneys: async (): Promise<{
    message: string;
    checked: number;
    built: number;
    skipped_has_journey: number;
    skipped_no_template: number;
  }> => {
    const response = await api.post('/enrollments/journey/backfill');
    return response.data;
  },
};
