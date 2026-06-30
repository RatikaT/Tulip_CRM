import api from './api';
import {
  JourneyTemplate,
  JourneyTemplateListResponse,
  JourneyStepDef,
  JourneyStepUpdate,
  JourneyStepCreate,
  JourneyContext,
  JourneyCatalogue,
  OutreachWorklistResponse,
} from '../types/journey.types';
import { Enrollment } from '../types/enrollment.types';
import { Lead } from '../types/lead.types';

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

  // Generalized (care + outreach)
  catalogue: async (): Promise<JourneyCatalogue> => {
    const res = await api.get<JourneyCatalogue>('/journey-templates/catalogue');
    return res.data;
  },

  listByContext: async (context: JourneyContext): Promise<{ templates: JourneyTemplate[] }> => {
    const res = await api.get('/journey-templates/list', { params: { context } });
    return res.data;
  },

  getOne: async (context: JourneyContext, triggerKey: string): Promise<JourneyTemplate> => {
    const res = await api.get<JourneyTemplate>('/journey-templates/one', {
      params: { context, trigger_key: triggerKey },
    });
    return res.data;
  },

  upsert: async (context: JourneyContext, triggerKey: string, steps: JourneyStepDef[]): Promise<JourneyTemplate> => {
    const res = await api.put<JourneyTemplate>('/journey-templates/upsert', {
      context, trigger_key: triggerKey, steps,
    });
    return res.data;
  },

  // ---- Enrollment (care) journey ----
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

  stopEnrollmentJourney: async (enrollmentId: string, reason?: string): Promise<Enrollment> => {
    const res = await api.post<Enrollment>(`/enrollments/${enrollmentId}/journey/stop`, { reason });
    return res.data;
  },

  setEnrollmentDnc: async (enrollmentId: string, doNotContact: boolean, reason?: string): Promise<Enrollment> => {
    const res = await api.post<Enrollment>(`/enrollments/${enrollmentId}/dnc`, { do_not_contact: doNotContact, reason });
    return res.data;
  },

  flagEnrollment: async (enrollmentId: string, flag: string, note?: string): Promise<Enrollment> => {
    const res = await api.post<Enrollment>(`/enrollments/${enrollmentId}/journey/flag`, { flag, note });
    return res.data;
  },

  reclassifyEnrollment: async (enrollmentId: string, target: string): Promise<Enrollment> => {
    const res = await api.post<Enrollment>(`/enrollments/${enrollmentId}/journey/reclassify`, { target });
    return res.data;
  },

  convertToAntenatal: async (enrollmentId: string): Promise<{ message: string; lead_id: string; enrollment: Enrollment }> => {
    const res = await api.post(`/enrollments/${enrollmentId}/convert-to-antenatal`);
    return res.data;
  },

  // ---- Lead (outreach) journey — admin actions ----
  outreachWorklist: async (overdue = false): Promise<OutreachWorklistResponse> => {
    const res = await api.get<OutreachWorklistResponse>('/leads/outreach/worklist', { params: { overdue } });
    return res.data;
  },

  updateLeadStep: async (leadId: string, stepId: string, body: JourneyStepUpdate): Promise<Lead> => {
    const res = await api.put<Lead>(`/leads/${leadId}/journey/${stepId}`, body);
    return res.data;
  },

  addLeadStep: async (leadId: string, body: JourneyStepCreate): Promise<Lead> => {
    const res = await api.post<Lead>(`/leads/${leadId}/journey`, body);
    return res.data;
  },

  deleteLeadStep: async (leadId: string, stepId: string): Promise<Lead> => {
    const res = await api.delete<Lead>(`/leads/${leadId}/journey/${stepId}`);
    return res.data;
  },

  stopLeadJourney: async (leadId: string, reason?: string): Promise<Lead> => {
    const res = await api.post<Lead>(`/leads/${leadId}/journey/stop`, { reason });
    return res.data;
  },

  reopenLead: async (leadId: string, reassignTo?: string): Promise<Lead> => {
    const res = await api.post<Lead>(`/leads/${leadId}/reopen`, { reassign_to: reassignTo });
    return res.data;
  },

  setLeadDnc: async (leadId: string, doNotContact: boolean, reason?: string): Promise<Lead> => {
    const res = await api.post<Lead>(`/leads/${leadId}/dnc`, { do_not_contact: doNotContact, reason });
    return res.data;
  },
};
