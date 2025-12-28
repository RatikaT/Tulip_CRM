// Enrollment Types

export type ConnectStatus = 'Connected' | 'No Response' | 'Follow Up Required' | 'Others';

export type ActionTaken =
  | 'Appointment Booked'
  | 'Feedback Taken'
  | 'No Action Required'
  | 'Liasoned with Partner Team';

export type ServicePartner =
  | 'Motherhood'
  | 'Rainbow'
  | 'Fortis'
  | 'Apollo Cradle'
  | 'Cloud 9'
  | 'HCL Healthcare'
  | 'Mamily'
  | 'Others';

export type Trimester = 'Trimester 1' | 'Trimester 2' | 'Trimester 3' | 'Not Conceived';

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
  hcl_location: string | null;

  // User Details
  uhid: string | null;
  subscriber_name: string;
  dob: string | null;
  employee_id: string;
  name: string | null;
  phone_number: string;
  email: string | null;
  address: string | null;

  // Service Details
  trimester: Trimester | null;
  doctor_name: string | null;
  service_partner: ServicePartner | null;
  partner_centre_selected: string | null;
  partner_gynaecologist: string | null;

  // Status
  connect_status: ConnectStatus | null;
  action_taken: ActionTaken | null;

  // Follow-up Tracking
  follow_up_date: string | null;
  customer_feedback: string | null;
  remarks: string | null;

  // Follow-ups History
  follow_ups: FollowUpEntry[];

  // Assignment
  assigned_to: string | null;
  assigned_to_name: string | null;

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
  // Mandatory
  subscriber_name: string;
  employee_id: string;
  phone_number: string;

  // Optional
  email?: string;
  billed_date?: string;
  package_billed?: string;
  hclhc_spoc?: string;
  hcl_location?: string;
  uhid?: string;
  dob?: string;
  name?: string;
  address?: string;
  trimester?: Trimester;
  doctor_name?: string;
  service_partner?: ServicePartner;
  partner_centre_selected?: string;
  partner_gynaecologist?: string;
  connect_status?: ConnectStatus;
  action_taken?: ActionTaken;
  follow_up_date?: string;
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
  hcl_location?: string;
  uhid?: string;
  dob?: string;
  name?: string;
  address?: string;
  trimester?: Trimester;
  doctor_name?: string;
  service_partner?: ServicePartner;
  partner_centre_selected?: string;
  partner_gynaecologist?: string;
  connect_status?: ConnectStatus;
  action_taken?: ActionTaken;
  follow_up_date?: string;
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
  'Motherhood',
  'Rainbow',
  'Fortis',
  'Apollo Cradle',
  'Cloud 9',
  'HCL Healthcare',
  'Mamily',
  'Others',
];

export const TRIMESTER_OPTIONS: Trimester[] = [
  'Trimester 1',
  'Trimester 2',
  'Trimester 3',
  'Not Conceived',
];
