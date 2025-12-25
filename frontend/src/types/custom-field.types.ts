/**
 * Custom Field Types
 */

export type FieldType = 'text' | 'number' | 'dropdown' | 'date' | 'checkbox' | 'textarea';

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'textarea', label: 'Text Area' },
];

export interface CustomField {
  id: string;
  field_name: string;
  field_label: string;
  field_type: FieldType;
  is_required: boolean;
  dropdown_options: string[];
  visible_to_agents: boolean;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface CustomFieldCreate {
  field_name: string;
  field_label: string;
  field_type: FieldType;
  is_required?: boolean;
  dropdown_options?: string[];
  visible_to_agents?: boolean;
  display_order?: number;
}

export interface CustomFieldUpdate {
  field_label?: string;
  is_required?: boolean;
  dropdown_options?: string[];
  visible_to_agents?: boolean;
  display_order?: number;
  is_active?: boolean;
}

export interface CustomFieldListResponse {
  fields: CustomField[];
  total: number;
}
