import api from './api';
import {
  DropdownConfig,
  DropdownConfigListResponse,
  AddOptionRequest,
  RemoveOptionRequest,
  UpdateOptionsRequest,
} from '../types/dropdown.types';

export const dropdownService = {
  /**
   * Get all dropdown configurations
   */
  async getDropdownConfigs(category?: string): Promise<DropdownConfigListResponse> {
    const params: { category?: string } = {};
    if (category) {
      params.category = category;
    }
    const response = await api.get<DropdownConfigListResponse>('/dropdown-configs', { params });
    return response.data;
  },

  /**
   * Get a specific dropdown configuration by field name
   */
  async getDropdownConfig(fieldName: string): Promise<DropdownConfig> {
    const response = await api.get<DropdownConfig>(`/dropdown-configs/${fieldName}`);
    return response.data;
  },

  /**
   * Update dropdown options
   */
  async updateDropdownConfig(fieldName: string, data: UpdateOptionsRequest): Promise<DropdownConfig> {
    const response = await api.put<DropdownConfig>(`/dropdown-configs/${fieldName}`, data);
    return response.data;
  },

  /**
   * Add a new option to a dropdown
   */
  async addOption(fieldName: string, data: AddOptionRequest): Promise<DropdownConfig> {
    const response = await api.post<DropdownConfig>(`/dropdown-configs/${fieldName}/add-option`, data);
    return response.data;
  },

  /**
   * Remove an option from a dropdown
   */
  async removeOption(fieldName: string, data: RemoveOptionRequest): Promise<DropdownConfig> {
    const response = await api.post<DropdownConfig>(`/dropdown-configs/${fieldName}/remove-option`, data);
    return response.data;
  },

  /**
   * Add a new parent option to a conditional dropdown
   */
  async addParentOption(fieldName: string, data: AddOptionRequest): Promise<DropdownConfig> {
    const response = await api.post<DropdownConfig>(`/dropdown-configs/${fieldName}/add-parent-option`, data);
    return response.data;
  },

  /**
   * Seed dropdown configurations (one-time migration)
   */
  async seedDropdownConfigs(): Promise<{ message: string; created: number; skipped: number }> {
    const response = await api.post<{ message: string; created: number; skipped: number }>('/dropdown-configs/seed');
    return response.data;
  },
};
