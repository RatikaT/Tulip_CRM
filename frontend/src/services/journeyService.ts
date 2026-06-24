import api from './api';
import {
  JourneyTemplate,
  JourneyTemplateListResponse,
  JourneyStepDef,
  JourneyStepUpdate,
  JourneyStepCreate,
} from '../types/journey.types';
import { Enrollment } from '../types/enrollment.types';

export const journeyService = {
  // ---- Templates (super admin) ----
  listTemplates: async (): Promise<JourneyTemplateListResponse> => {
    const res = await api.get<JourneyTemplateListResponse>('/journey-templates');
    return res.data;
  },

  getTemplate: async (service: string): Promise<JourneyTemplate> => {
    const res = await api.get<JourneyTemplate>(`/journey-templates/${encodeURIComponent(service)}`);
    return res.data;
  },

  saveTemplate: async (service: string, steps: JourneyStepDef[]): Promise<JourneyTemplate> => {
    const res = await api.put<JourneyTemplate>(`/journey-templates/${encodeURIComponent(service)}`, { steps });
    return res.data;
  },

  // ---- Enrollment journey execution (SPOC / admin) ----
  instantiate: async (enrollmentId: string, force = false): Promise<Enrollment> => {
    const res = await api.post<Enrollment>(`/enrollments/${enrollmentId}/journey/instantiate`, null, {
      params: { force },
    });
    return res.data;
  },

  updateStep: async (enrollmentId: string, stepId: string, body: JourneyStepUpdate): Promise<Enrollment> => {
    const res = await api.put<Enrollment>(`/enrollments/${enrollmentId}/journey/${stepId}`, body);
    return res.data;
  },

  addStep: async (enrollmentId: string, body: JourneyStepCreate): Promise<Enrollment> => {
    const res = await api.post<Enrollment>(`/enrollments/${enrollmentId}/journey`, body);
    return res.data;
  },

  deleteStep: async (enrollmentId: string, stepId: string): Promise<Enrollment> => {
    const res = await api.delete<Enrollment>(`/enrollments/${enrollmentId}/journey/${stepId}`);
    return res.data;
  },
};
