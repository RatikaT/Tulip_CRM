/**
 * Types for the Summaries page: the Daily SPOC Report (GET /dashboard/spoc-report),
 * the per-SPOC scorecard built from the same data, and saved reports.
 *
 * Datetimes from the backend are naive UTC ISO strings - format them with the
 * IST helpers in utils/dateUtils.
 */

export type SpocBucket = 'newL' | 'due' | 'over' | 'enrDue' | 'enrOver';

export interface SpocCounts {
  newL: number;
  due: number;
  over: number;
  enrDue: number;
  enrOver: number;
  total: number;
  acted: number;
  not: number;
}

export type SpocCountKey = keyof SpocCounts;

export interface SpocAction {
  at: string;
  what: string;
  by: string;
}

export interface SpocItem {
  type: 'lead' | 'enrollment';
  id: string;
  name: string;
  /** '' for "extra" work that wasn't on the list */
  bucket: SpocBucket | '';
  why: string;
  acted: boolean;
  actions: SpocAction[];
}

export interface SpocResultEntry {
  id: string;
  name: string;
  at: string;
  by: string;
}

export interface SpocClosedEntry extends SpocResultEntry {
  reason: string;
  status: string;
}

export interface SpocResults {
  enrolled: number;
  closed: number;
  closed_reasons: Record<string, number>;
  enrolled_list: SpocResultEntry[];
  closed_list: SpocClosedEntry[];
}

export interface SpocCare {
  planned: number;
  done: number;
  rescheduled: number;
  skipped: number;
  pending: number;
  overdue_before: number;
  done_ahead: number;
}

export interface SpocTrendPoint {
  date: string;
  total: number;
  acted: number;
}

export interface SpocReportRow {
  user_id: string | null;
  name: string;
  counts: SpocCounts;
  /** [count, acted] per bucket */
  split: Record<SpocBucket, [number, number]>;
  items: SpocItem[];
  extra: SpocItem[];
  new_status: Record<string, number>;
  results: SpocResults;
  care: SpocCare;
  portfolio: { leads: number; enrollments: number };
  last_action_at: string | null;
  trend?: SpocTrendPoint[];
}

export interface SpocReport {
  start: string;
  end: string;
  days: number;
  generated_at: string;
  headline: { new_leads_created: number; assigned: number; unassigned: number };
  totals: SpocCounts;
  rows: SpocReportRow[];
}

export interface SpocReportParams {
  start: string;
  end: string;
  user_id?: string;
}

/** Snapshot stored in Summary.activity_metrics by POST /dashboard/spoc-report/save */
export interface SavedSpocSnapshot {
  start: string;
  end: string;
  headline: SpocReport['headline'];
  totals: SpocCounts;
  rows: Array<{
    name: string;
    user_id: string | null;
    counts: SpocCounts;
    results: Pick<SpocResults, 'enrolled' | 'closed' | 'closed_reasons'>;
    care: SpocCare;
    portfolio: { leads: number; enrollments: number };
  }>;
}

export type SummaryType = 'overall' | 'agent' | 'daily' | 'spoc_report';

// Stored summary (GET /dashboard/summaries)
export interface Summary {
  id: string;
  summary_type: SummaryType;
  content: string;
  agent_id?: string | null;
  agent_name?: string | null;
  summary_date?: string | null;
  total_leads: number;
  activity_metrics?: SavedSpocSnapshot | null;
  created_at: string;
  created_by_name?: string | null;
}
