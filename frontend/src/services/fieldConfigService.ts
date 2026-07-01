import api from './api';
import {
  FieldConfigItem,
  FieldConfigListResponse,
  AllFieldConfigResponse,
} from '../types/fieldConfig.types';

export const fieldConfigService = {
  list: async (form: 'lead' | 'enrollment'): Promise<FieldConfigListResponse> => {
    const res = await api.get<FieldConfigListResponse>('/field-configs', { params: { form } });
    return res.data;
  },

  all: async (): Promise<AllFieldConfigResponse> => {
    const res = await api.get<AllFieldConfigResponse>('/field-configs/all');
    return res.data;
  },

  upsert: async (body: {
    form: 'lead' | 'enrollment';
    field_name: string;
    label?: string;
    input_type: string;
    required: boolean;
    options: string[];
  }): Promise<FieldConfigItem> => {
    const res = await api.put<FieldConfigItem>('/field-configs', body);
    return res.data;
  },
};
