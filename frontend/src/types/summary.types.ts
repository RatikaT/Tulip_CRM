/**
 * Types for Summary and Agent Activity features
 * Updated for comprehensive agent daily activity summary
 */

// =============================================
// LEADS ASSIGNMENT TYPES
// =============================================

export interface NewLeadAssigned {
  lead_id: string;
  name: string;
  phone?: string;
  status: string;
  lead_source?: string;
  created_at?: string;
}

export interface LeadReassignedToAgent {
  lead_id: string;
  name: string;
  status: string;
  reassigned_from?: string;
  reassigned_at?: string;
}

export interface LeadReassignedFromAgent {
  lead_id: string;
  name: string;
  status: string;
  reassigned_to?: string;
  reassigned_at?: string;
}

export interface LeadsAssignment {
  new_leads: NewLeadAssigned[];
  reassigned_to_agent: LeadReassignedToAgent[];
  reassigned_from_agent: LeadReassignedFromAgent[];
}

// =============================================
// ENROLLMENTS ASSIGNMENT TYPES
// =============================================

export interface NewEnrollmentAssigned {
  enrollment_id: string;
  name: string;
  phone?: string;
  connect_status?: string;
  service_enrolled?: string;
  created_at?: string;
}

export interface EnrollmentReassignedToAgent {
  enrollment_id: string;
  name: string;
  connect_status?: string;
  reassigned_from?: string;
  reassigned_at?: string;
}

export interface EnrollmentReassignedFromAgent {
  enrollment_id: string;
  name: string;
  connect_status?: string;
  reassigned_to?: string;
  reassigned_at?: string;
}

export interface EnrollmentsAssignment {
  new_enrollments: NewEnrollmentAssigned[];
  reassigned_to_agent: EnrollmentReassignedToAgent[];
  reassigned_from_agent: EnrollmentReassignedFromAgent[];
}

// =============================================
// FOLLOW-UPS TYPES
// =============================================

export interface LeadFollowUp {
  lead_id: string;
  name: string;
  status: string;
  follow_up_time?: string;
  is_overdue: boolean;
}

export interface EnrollmentFollowUp {
  enrollment_id: string;
  name: string;
  connect_status?: string;
  next_follow_up_date?: string;
}

export interface FollowUps {
  leads: LeadFollowUp[];
  enrollments: EnrollmentFollowUp[];
}

// =============================================
// ACTIONS TYPES
// =============================================

export interface FieldChange {
  field: string;
  old_value?: string | number | boolean | null;
  new_value?: string | number | boolean | null;
}

export interface LeadActionDetail {
  lead_id: string;
  lead_name: string;
  action_type: string;
  changes: FieldChange[];
  timestamp?: string;
}

export interface LeadActionCounts {
  status_changes: number;
  comments_added: number;
  calls_logged: number;
  field_updates: number;
  [key: string]: number;
}

export interface LeadActions {
  total_actions: number;
  by_type: LeadActionCounts;
  details: LeadActionDetail[];
}

export interface EnrollmentActionDetail {
  enrollment_id: string;
  enrollment_name: string;
  action_type: string;
  changes: FieldChange[];
  timestamp?: string;
}

export interface EnrollmentActionCounts {
  status_changes: number;
  follow_ups_added: number;
  field_updates: number;
  [key: string]: number;
}

export interface EnrollmentActions {
  total_actions: number;
  by_type: EnrollmentActionCounts;
  details: EnrollmentActionDetail[];
}

// =============================================
// SUMMARY STATS TYPES
// =============================================

export interface AgentActivitySummary {
  // Portfolio totals (all leads/enrollments with this agent)
  total_leads_with_agent: number;
  total_enrollments_with_agent: number;
  // Activity on selected date
  total_leads_worked: number;
  total_enrollments_worked: number;
  new_leads_assigned: number;
  leads_reassigned_in: number;
  leads_reassigned_out: number;
  new_enrollments_assigned: number;
  enrollments_reassigned_in: number;
  enrollments_reassigned_out: number;
  total_lead_actions: number;
  total_enrollment_actions: number;
  followups_due_leads: number;
  followups_due_enrollments: number;
}

// =============================================
// MAIN RESPONSE TYPE
// =============================================

export interface AgentActivityResponse {
  agent_id: string;
  agent_name: string;
  date: string;
  leads_assignment: LeadsAssignment;
  enrollments_assignment: EnrollmentsAssignment;
  followups: FollowUps;
  lead_actions: LeadActions;
  enrollment_actions: EnrollmentActions;
  summary: AgentActivitySummary;
}

// =============================================
// LEGACY TYPES (kept for backward compatibility)
// =============================================

// Agent Activity Summary Metrics (legacy)
export interface AgentActivityMetrics {
  total_leads_assigned: number;
  calls_made_today: number;
  followups_due_today: number;
  followups_overdue: number;
  status_changes_today: number;
  comments_added_today: number;
  reassignments_made: number;
}

// Lead Detail Types for Agent Activity (legacy)
export interface LeadAssignedDetail {
  lead_id: string;
  name: string;
  status: string;
  phone_number?: string;
  assigned_date?: string;
}

export interface CallMadeDetail {
  lead_id: string;
  name: string;
  call_number: number;
  call_time: string;
  summary: string;
}

export interface FollowupDetail {
  lead_id: string;
  name: string;
  follow_up_date: string;
  status: string;
}

export interface FollowupOverdueDetail {
  lead_id: string;
  name: string;
  follow_up_date: string;
  days_overdue: number;
  status: string;
}

export interface StatusChangeDetail {
  lead_id: string;
  name: string;
  old_status: string;
  new_status: string;
  changed_at: string;
}

export interface CommentDetail {
  lead_id: string;
  name: string;
  comment_preview: string;
  added_at: string;
}

export interface ReassignmentDetail {
  lead_id: string;
  name: string;
  reassigned_to: string;
  reassigned_at: string;
}

// Lead Details breakdown (legacy)
export interface AgentActivityLeadDetails {
  leads_assigned: LeadAssignedDetail[];
  calls_made: CallMadeDetail[];
  followups_due: FollowupDetail[];
  followups_overdue: FollowupOverdueDetail[];
  status_changes: StatusChangeDetail[];
  comments_added: CommentDetail[];
  reassignments: ReassignmentDetail[];
}

// =============================================
// SUMMARY TYPES
// =============================================

// Summary type enum
export type SummaryType = 'overall' | 'agent' | 'daily';

// Stored Summary
export interface Summary {
  id: string;
  summary_type: SummaryType;
  content: string;
  agent_id?: string;
  agent_name?: string;
  summary_date?: string;
  total_leads: number;
  status_distribution: Record<string, number>;
  source_distribution: Record<string, number>;
  service_distribution: Record<string, number>;
  activity_metrics?: AgentActivityMetrics;
  lead_details?: AgentActivityLeadDetails;
  created_at: string;
  created_by_name?: string;
}

// Create Summary Request
export interface CreateSummaryRequest {
  summary_type: SummaryType;
  content: string;
  agent_id?: string;
  agent_name?: string;
  summary_date?: string;
  total_leads?: number;
  status_distribution?: Record<string, number>;
  source_distribution?: Record<string, number>;
  service_distribution?: Record<string, number>;
  activity_metrics?: AgentActivityMetrics;
  lead_details?: AgentActivityLeadDetails;
}
