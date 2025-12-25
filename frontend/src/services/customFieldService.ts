import api from './api';
import {
  CustomField,
  CustomFieldCreate,
  CustomFieldUpdate,
  CustomFieldListResponse,
} from '../types/custom-field.types';

export const customFieldService = {
  // Get all custom fields
  getFields: async (activeOnly: boolean = true): Promise<CustomFieldListResponse> => {
    const response = await api.get<CustomFieldListResponse>('/custom-fields', {
      params: { active_only: activeOnly },
    });
    return response.data;
  },

  // Get a single custom field
  getField: async (fieldId: string): Promise<CustomField> => {
    const response = await api.get<CustomField>(`/custom-fields/${fieldId}`);
    return response.data;
  },

  // Create a new custom field
  createField: async (data: CustomFieldCreate): Promise<CustomField> => {
    const response = await api.post<CustomField>('/custom-fields', data);
    return response.data;
  },

  // Update a custom field
  updateField: async (fieldId: string, data: CustomFieldUpdate): Promise<CustomField> => {
    const response = await api.put<CustomField>(`/custom-fields/${fieldId}`, data);
    return response.data;
  },

  // Delete a custom field
  deleteField: async (fieldId: string): Promise<void> => {
    await api.delete(`/custom-fields/${fieldId}`);
  },
};
