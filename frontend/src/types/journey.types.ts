// Care + Outreach Journey types

export type StepType = 'Call' | 'Email' | 'WhatsApp' | 'Appointment' | 'Lab' | 'Other';
export const STEP_TYPE_OPTIONS: StepType[] = ['Call', 'Email', 'WhatsApp', 'Appointment', 'Lab', 'Other'];

// The 3 standardized services (must match SERVICE_*_OPTIONS)
export const JOURNEY_SERVICES = ['Antenatal', 'PreConception', 'MaternityWellness'] as const;

export type JourneyContext = 'care' | 'outreach';

// ---- Template (super-admin-defined) ----
export interface JourneyStepDef {
  step_id?: string;
  name: string;
  description?: string | null;
  step_type: string;
  offset_days: number;
  order: number;
  // Recurrence (materialized into dated occurrences at build time)
  recurrence_days?: number | null;
  recurrence_count?: number | null;
  horizon?: 'trimester' | null;
  is_optional?: boolean;
}

export interface JourneyTemplate {
  context?: JourneyContext;
  trigger_key?: string;
  service?: string | null;     // alias of trigger_key for care
  steps: JourneyStepDef[];
  updated_at?: string | null;
  updated_by_name?: string | null;
}

export interface JourneyTemplateListResponse {
  templates: JourneyTemplate[];
  services: string[];
}

export interface CatalogueEntry {
  context: JourneyContext;
  trigger_key: string;
  label: string;
}

export interface JourneyCatalogue {
  care: CatalogueEntry[];
  outreach: CatalogueEntry[];
  statuses: string[];
  services: string[];
}

// ---- Instance (snapshot on an enrollment, worked by the SPOC) ----
export type JourneyStepStatus = 'pending' | 'done' | 'skipped';

export interface JourneyStepInstance {
  step_id: string;
  template_step_id?: string;
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
  occurrence_index?: number;
  is_optional?: boolean;
  is_adhoc?: boolean;
}

// Journey-level controls + agent trigger hints shared by Lead & Enrollment.
export interface JourneyTriggers {
  needs_trimester?: boolean;
  trimester_contradiction?: boolean;
  is_preconception?: boolean;
}

// A row in the central outreach worklist.
export interface OutreachWorklistItem {
  lead_id: string;
  lead_name?: string | null;
  phone_number?: string | null;
  status?: string | null;
  service_requested?: string | null;
  assigned_to_name?: string | null;
  step_id: string;
  step_name?: string | null;
  step_type?: string | null;
  step_status?: string | null;      // pending | done | skipped
  planned_date?: string | null;
  order?: number;
  is_optional?: boolean;
  is_overdue?: boolean;
}

export interface OutreachWorklistResponse {
  items: OutreachWorklistItem[];
  total: number;
  overdue_only: boolean;
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
