// Lead Types

export type LeadStatus =
  | 'Not Interested'
  | 'Enquiry Lead'
  | 'Lead Closed-No Response'
  | 'Enrolled'
  | 'Follow up-In Process'
  | 'Follow up-No Response'
  | 'Duplicate';

export type LeadSource =
  | 'In Clinic-Walk In'
  | 'Mail'
  | 'In Clinic-Gynae Consult'
  | 'Bump Day'
  | 'Website'
  | 'Call'
  | 'AMA'
  | 'WhatsApp'
  | 'In Clinic-Other Consults'
  | 'Others';

export type Trimester =
  | 'Trimester 1'
  | 'Trimester 2'
  | 'Trimester 3'
  | 'Not Conceived';

export type LookingFor = 'Self' | 'Family Member';

export type ServiceEnrolled = 'PreConception' | 'Antenatal' | 'MaternityWellness';

export type ServicePartner =
  | 'Motherhood'
  | 'Rainbow'
  | 'Fortis'
  | 'Apollo Cradle'
  | 'Cloud 9'
  | 'HCL Healthcare'
  | 'Mamily'
  | 'Others';

export type ReasonForNoSale =
  | 'Already Taking Service outside'
  | 'Location not suitable'
  | 'Different Service Provider Required-Brand'
  | 'Travelling to Native Place for delivery'
  | 'Package Cost'
  | 'Only Delivery Package required'
  | 'Package inadequate'
  | 'Miscarriage'
  | 'Looking for other HCLH services'
  | 'Others';

export interface CallEntry {
  call_number: number;
  date_time: string | null;
  summary: string | null;
}

export interface Comment {
  text: string;
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
}

export interface Lead {
  id: string;
  lead_id: string;

  // Timestamps
  created_at: string;
  updated_at: string;

  // Lead Source and Status
  lead_source: LeadSource | null;
  lead_creation_date: string | null;
  status: LeadStatus;

  // User Details
  name: string;
  email: string | null;
  phone_number: string;
  employee_id: string | null;
  uhid: string | null;

  // Location Details
  user_facility: string | null;
  city: string | null;
  pin_code: string | null;
  address: string | null;

  // Lead Information
  trimester: Trimester | null;
  looking_for: LookingFor | null;
  package_requested: string | null;

  // Service Details
  service_enrolled: ServiceEnrolled | null;
  package_name_enrolled: string | null;
  service_partner: ServicePartner | null;
  provider_location: string | null;
  hclhc_spoc: string | null;

  // Reason for No Sale
  reason_for_no_sale: ReasonForNoSale | null;

  // Doctor/Consultation Details
  doctor_name: string | null;
  consult_date: string | null;

  // Call Tracking
  number_of_calls: number;
  calls: CallEntry[];
  follow_up_date: string | null;

  // Assignment
  assigned_to: string | null;
  assigned_to_name: string | null;

  // Reassignment (editable by both admin and agent)
  reassign_to: string | null;
  reassign_to_name: string | null;

  // Comments
  comments: Comment[];

  // System
  created_by: string | null;
}

export interface LeadListResponse {
  leads: Lead[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface LeadCreateRequest {
  // Mandatory fields
  lead_source: LeadSource;
  name: string;
  phone_number: string;

  // Optional fields
  lead_creation_date?: string;
  email?: string;
  employee_id?: string;
  uhid?: string;
  user_facility?: string;
  city?: string;
  pin_code?: string;
  address?: string;
  trimester?: Trimester;
  looking_for?: LookingFor;
  package_requested?: string;
  service_enrolled?: ServiceEnrolled;
  package_name_enrolled?: string;
  service_partner?: ServicePartner;
  provider_location?: string;
  hclhc_spoc?: string;
  reason_for_no_sale?: ReasonForNoSale;
  doctor_name?: string;
  consult_date?: string;
  follow_up_date?: string;
  assigned_to?: string;
}

export interface LeadUpdateRequest {
  // Agent editable fields
  lead_source?: LeadSource;
  lead_creation_date?: string;
  status?: LeadStatus;
  number_of_calls?: number;
  calls?: CallEntry[];
  follow_up_date?: string | null;

  // Admin-only editable fields
  name?: string;
  email?: string;
  phone_number?: string;
  employee_id?: string;
  uhid?: string;
  user_facility?: string;
  city?: string;
  pin_code?: string;
  address?: string;
  trimester?: Trimester;
  looking_for?: LookingFor;
  package_requested?: string;
  service_enrolled?: ServiceEnrolled;
  package_name_enrolled?: string;
  service_partner?: ServicePartner;
  provider_location?: string;
  hclhc_spoc?: string;
  reason_for_no_sale?: ReasonForNoSale;
  doctor_name?: string;
  consult_date?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  reassign_to?: string;
  reassign_to_name?: string;
}

export interface CommentCreateRequest {
  text: string;
}

export interface AuditLogEntry {
  id: string;
  user_email: string;
  user_name: string;
  action: string;
  changes: Array<{ field: string; old_value: unknown; new_value: unknown }>;
  timestamp: string;
}

export interface AuditTrailResponse {
  lead_id: string;
  audit_trail: AuditLogEntry[];
}

export const LEAD_STATUS_OPTIONS: LeadStatus[] = [
  'Not Interested',
  'Enquiry Lead',
  'Lead Closed-No Response',
  'Enrolled',
  'Follow up-In Process',
  'Follow up-No Response',
  'Duplicate',
];

export const LEAD_SOURCE_OPTIONS: LeadSource[] = [
  'In Clinic-Walk In',
  'Mail',
  'In Clinic-Gynae Consult',
  'Bump Day',
  'Website',
  'Call',
  'AMA',
  'WhatsApp',
  'In Clinic-Other Consults',
  'Others',
];

export const TRIMESTER_OPTIONS: Trimester[] = [
  'Trimester 1',
  'Trimester 2',
  'Trimester 3',
  'Not Conceived',
];

export const LOOKING_FOR_OPTIONS: LookingFor[] = ['Self', 'Family Member'];

export const SERVICE_ENROLLED_OPTIONS: ServiceEnrolled[] = [
  'PreConception',
  'Antenatal',
  'MaternityWellness',
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

export const REASON_FOR_NO_SALE_OPTIONS: ReasonForNoSale[] = [
  'Already Taking Service outside',
  'Location not suitable',
  'Different Service Provider Required-Brand',
  'Travelling to Native Place for delivery',
  'Package Cost',
  'Only Delivery Package required',
  'Package inadequate',
  'Miscarriage',
  'Looking for other HCLH services',
  'Others',
];
