// Enrollment Types
import { JourneyStepInstance, JourneyTriggers } from './journey.types';

export type ConnectStatus = 'Connected' | 'No Response' | 'Follow Up Required' | 'Others';

export type ActionTaken =
  | 'Appointment Booked'
  | 'Feedback Taken'
  | 'No Action Required'
  | 'Liasoned with Partner Team';

export type ServicePartner =
  | 'Apollo Cradle'
  | 'Fortis'
  | 'Fortis La Femme'
  | 'Mamily'
  | 'Motherhood'
  | 'Rainbow'
  | 'Thyrocare'
  | 'Agilus'
  | 'Others';

export type Trimester = 'Trimester 1' | 'Trimester 2' | 'Trimester 3' | 'Not Conceived';

export type ServiceEnrolled = 'PreConception' | 'Antenatal' | 'MaternityWellness';

export interface FollowUpEntry {
  follow_up_number: number;
  date: string | null;
  connect_status: string | null;
  action_taken: string | null;
  feedback: string | null;
  remarks: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string | null;
}

export interface Enrollment {
  id: string;
  enrollment_id: string;
  linked_lead_id: string | null;

  // Timestamps
  created_at: string;
  updated_at: string;

  // Billing Info
  billed_date: string | null;
  package_billed: string | null;

  // HCLH Details
  hclhc_spoc: string | null;
  hcl_facility: string | null;

  // User Details
  uhid: string | null;
  subscriber_name: string;
  dob: string | null;
  employee_id: string | null;
  name: string | null;
  phone_number: string | null;
  email: string | null;
  address: string | null;

  // Service Details
  trimester: Trimester | null;
  service_enrolled: ServiceEnrolled | null;
  package_name_enrolled: string | null;
  doctor_name: string | null;
  service_partner: ServicePartner | null;
  partner_centre_selected: string | null;
  partner_gynaecologist: string | null;

  // Status
  connect_status: ConnectStatus | null;
  action_taken: ActionTaken | null;

  // Follow-up Tracking
  follow_up_date: string | null;
  next_follow_up_date: string | null;
  customer_feedback: string | null;
  remarks: string | null;

  // Follow-ups History
  follow_ups: FollowUpEntry[];

  // Care Journey (snapshot of the service's journey template)
  journey?: JourneyStepInstance[];
  journey_status?: string;
  journey_stopped_reason?: string | null;
  journey_stopped_by_name?: string | null;
  journey_stopped_at?: string | null;
  journey_flag?: string | null;
  journey_flag_note?: string | null;
  journey_classification?: string | null;
  converted_to_lead_id?: string | null;
  do_not_contact?: boolean;
  dnc_reason?: string | null;
  journey_triggers?: JourneyTriggers;

  // Assignment
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_date: string | null;
  reassigned_to: string | null;
  reassigned_to_name: string | null;
  reassigned_date: string | null;

  // System
  created_by: string | null;
  created_by_name: string | null;
}

export interface EnrollmentListResponse {
  enrollments: Enrollment[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface EnrollmentCreateRequest {
  // Optional
  subscriber_name?: string;

  // At least one of these required: email, uhid, phone_number
  email?: string;
  uhid?: string;
  phone_number?: string;

  // Optional
  employee_id?: string;
  billed_date?: string;
  package_billed?: string;
  hclhc_spoc?: string;
  hcl_facility?: string;
  dob?: string;
  name?: string;
  address?: string;
  trimester?: Trimester;
  service_enrolled?: ServiceEnrolled;
  package_name_enrolled?: string;
  doctor_name?: string;
  service_partner?: ServicePartner;
  partner_centre_selected?: string;
  partner_gynaecologist?: string;
  connect_status?: ConnectStatus;
  action_taken?: ActionTaken;
  follow_up_date?: string;
  next_follow_up_date?: string;
  customer_feedback?: string;
  remarks?: string;
  assigned_to?: string;
}

export interface EnrollmentUpdateRequest {
  subscriber_name?: string;
  employee_id?: string;
  phone_number?: string;
  email?: string;
  billed_date?: string;
  package_billed?: string;
  hclhc_spoc?: string;
  hcl_facility?: string;
  uhid?: string;
  dob?: string;
  name?: string;
  address?: string;
  trimester?: Trimester;
  service_enrolled?: ServiceEnrolled;
  package_name_enrolled?: string;
  doctor_name?: string;
  service_partner?: ServicePartner;
  partner_centre_selected?: string;
  partner_gynaecologist?: string;
  connect_status?: ConnectStatus;
  action_taken?: ActionTaken;
  follow_up_date?: string;
  next_follow_up_date?: string;
  customer_feedback?: string;
  remarks?: string;
  assigned_to?: string;
  assigned_to_name?: string;
}

export interface FollowUpCreateRequest {
  connect_status?: ConnectStatus;
  action_taken?: ActionTaken;
  feedback?: string;
  remarks?: string;
  follow_up_date?: string;
}

export interface EnrollmentStatsResponse {
  total: number;
  new_today: number;
  assigned_today: number;  // For agents: enrollments assigned/reassigned to them today
  follow_up_today: number;  // For agents: enrollments with follow-up required today
  by_partner: Record<string, number>;
  by_status: Record<string, number>;
}

export interface BulkUploadResponse {
  success: boolean;
  message: string;
  total_rows: number;
  created: number;
  errors: Array<{ row: number; error: string }>;
}

// Dropdown Options
export const CONNECT_STATUS_OPTIONS: ConnectStatus[] = [
  'Connected',
  'No Response',
  'Follow Up Required',
  'Others',
];

export const ACTION_TAKEN_OPTIONS: ActionTaken[] = [
  'Appointment Booked',
  'Feedback Taken',
  'No Action Required',
  'Liasoned with Partner Team',
];

export const SERVICE_PARTNER_OPTIONS: ServicePartner[] = [
  'Apollo Cradle',
  'Fortis',
  'Fortis La Femme',
  'Mamily',
  'Motherhood',
  'Rainbow',
  'Thyrocare',
  'Agilus',
  'Others',
];

export const TRIMESTER_OPTIONS: Trimester[] = [
  'Trimester 1',
  'Trimester 2',
  'Trimester 3',
  'Not Conceived',
];

// Standardized to 3 services (matches SERVICE_REQUESTED_OPTIONS). Free-solo
// dropdowns still display any legacy values on existing enrollments.
export const SERVICE_ENROLLED_OPTIONS: string[] = [
  'Antenatal',
  'PreConception',
  'MaternityWellness',
];

// Package options for Package Name Enrolled
export const PACKAGE_OPTIONS: string[] = [
  'Tulip Pre-Conception',
  'Tulip Antenatal',
  'Tulip Wellness',
  'Tulip Pre-Conception + Antenatal',
  'Tulip Antenatal + Wellness',
  'Tulip Pre-Conception + Antenatal + Wellness',
];

// Audit Trail Types
export interface EnrollmentAuditChange {
  field: string;
  old_value: unknown;
  new_value: unknown;
}

export interface EnrollmentAuditLogEntry {
  id: string;
  user_email: string;
  user_name: string;
  action: string;
  changes: EnrollmentAuditChange[];
  timestamp: string;
}

export interface EnrollmentAuditTrailResponse {
  enrollment_id: string;
  audit_trail: EnrollmentAuditLogEntry[];
}
