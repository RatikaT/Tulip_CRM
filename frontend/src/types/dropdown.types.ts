// Dropdown Configuration Types

export interface DropdownConfig {
  id: string;
  field_name: string;
  display_name: string;
  category: string;
  options: string[];
  conditional_options?: Record<string, string[]>;
  is_conditional: boolean;
  parent_field?: string;
  created_at: string;
  updated_at: string;
}

export interface DropdownConfigListResponse {
  configs: DropdownConfig[];
  total: number;
}

export interface AddOptionRequest {
  value: string;
  parent_value?: string;
}

export interface RemoveOptionRequest {
  value: string;
  parent_value?: string;
}

export interface UpdateOptionsRequest {
  options?: string[];
  conditional_options?: Record<string, string[]>;
}
