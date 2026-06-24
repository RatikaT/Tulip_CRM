// Care Journey types

export type StepType = 'Call' | 'Email' | 'Appointment' | 'Lab' | 'Other';
export const STEP_TYPE_OPTIONS: StepType[] = ['Call', 'Email', 'Appointment', 'Lab', 'Other'];

// The 3 standardized services (must match SERVICE_*_OPTIONS)
export const JOURNEY_SERVICES = ['Antenatal', 'PreConception', 'MaternityWellness'] as const;

// ---- Template (super-admin-defined) ----
export interface JourneyStepDef {
  step_id?: string;
  name: string;
  description?: string | null;
  step_type: string;
  offset_days: number;
  order: number;
}

export interface JourneyTemplate {
  service: string;
  steps: JourneyStepDef[];
  updated_at?: string | null;
  updated_by_name?: string | null;
}

export interface JourneyTemplateListResponse {
  templates: JourneyTemplate[];
  services: string[];
}

// ---- Instance (snapshot on an enrollment, worked by the SPOC) ----
export type JourneyStepStatus = 'pending' | 'done' | 'skipped';

export interface JourneyStepInstance {
  step_id: string;
  name: string;
  description?: string | null;
  step_type?: string | null;
  planned_date?: string | null;
  status: JourneyStepStatus;
  completed_date?: string | null;
  completed_by?: string | null;
  completed_by_name?: string | null;
  notes?: string | null;
  order: number;
  is_adhoc?: boolean;
}

export interface JourneyStepUpdate {
  status?: JourneyStepStatus;
  planned_date?: string | null;
  notes?: string | null;
}

export interface JourneyStepCreate {
  name: string;
  description?: string | null;
  step_type?: string;
  planned_date?: string | null;
}
