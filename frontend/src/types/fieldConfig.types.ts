// Super-admin field configuration types

export type FieldInputType = 'text' | 'dropdown';

export interface FieldConfigItem {
  form: string;                 // 'lead' | 'enrollment'
  field_name: string;
  label: string;
  input_type: FieldInputType | string;
  required: boolean;
  options: string[];
  order: number;
  updated_by_name?: string | null;
}

export interface FieldConfigListResponse {
  form: string;
  fields: FieldConfigItem[];
}

export interface AllFieldConfigResponse {
  lead: FieldConfigItem[];
  enrollment: FieldConfigItem[];
}
