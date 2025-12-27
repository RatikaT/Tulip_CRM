/**
 * Types for Summary and Agent Activity features
 */

// Agent Activity Summary Metrics
export interface AgentActivityMetrics {
  total_leads_assigned: number;
  calls_made_today: number;
  followups_due_today: number;
  followups_overdue: number;
  status_changes_today: number;
  comments_added_today: number;
  reassignments_made: number;
}

// Lead Detail Types for Agent Activity
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

// Lead Details breakdown
export interface AgentActivityLeadDetails {
  leads_assigned: LeadAssignedDetail[];
  calls_made: CallMadeDetail[];
  followups_due: FollowupDetail[];
  followups_overdue: FollowupOverdueDetail[];
  status_changes: StatusChangeDetail[];
  comments_added: CommentDetail[];
  reassignments: ReassignmentDetail[];
}

// Full Agent Activity Response
export interface AgentActivityResponse {
  agent_id: string;
  agent_name: string;
  date: string;
  summary: AgentActivityMetrics;
  lead_details: AgentActivityLeadDetails;
}

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
