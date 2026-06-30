// Lead Types
import { JourneyStepInstance } from './journey.types';

export type LeadStatus =
  | 'Not Interested'
  | 'Enquiry Lead'
  | 'Lead Closed-No Response'
  | 'Enrolled'
  | 'Follow up-In Process'
  | 'Follow up-No Response'
  | 'Duplicate';

export type LeadSource =
  | 'Prescription Dump'
  | 'In Clinic-Gynae Consult'
  | 'In Clinic-Other Consults'
  | 'In Clinic-Walk In'
  | 'AMA'
  | 'BEWELL'
  | 'Events'
  | 'Call'
  | 'Others'
  | 'Bump Day'
  | 'WhatsApp'
  | 'Mail'
  | 'Tele-Consultation'
  | 'Website'
  | 'Habit Banner';

export type Trimester =
  | 'Trimester 1'
  | 'Trimester 2'
  | 'Trimester 3'
  | 'Not Conceived';

export type LookingFor = 'Self' | 'Family Member';

export type ServiceRequested = 'PreConception' | 'Antenatal' | 'MaternityWellness';

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
  alternate_mobile_number: string | null;
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
  family_member_relation: string | null;
  package_requested: string | null;

  // Service Details
  service_requested: ServiceRequested | null;
  package_name_enrolled: string | null;
  service_partner: ServicePartner | null;
  provider_location: string | null;
  hclhc_spoc: string | null;

  // Reason for No Sale
  reason_for_no_sale: ReasonForNoSale | null;

  // Doctor/Consultation Details
  doctor_name: string | null;
  doctor_speciality: string | null;
  consult_date: string | null;

  // Medical/Clinical Details
  visit_id: string | null;
  age: number | null;
  gender: string | null;
  icd_code: string | null;
  diagnosis: string | null;
  investigation_item_name: string | null;
  investigation_service_type: string | null;
  cug_name: string | null;

  // Call Tracking
  number_of_calls: number;
  calls: CallEntry[];
  follow_up_date: string | null;

  // Assignment
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_date: string | null;

  // Reassignment (editable by both admin and agent)
  reassign_to: string | null;
  reassign_to_name: string | null;
  reassigned_date: string | null;

  // Comments
  comments: Comment[];

  // System
  created_by: string | null;

  // Duplicate tracking (optional, present on dedup endpoints)
  duplicate_status?: string | null;
  duplicate_of?: string | null;
  duplicate_resolved_at?: string | null;

  // Outreach Journey (central, admin-owned; agents read-only)
  journey?: JourneyStepInstance[];
  journey_status?: string;
  journey_stopped_reason?: string | null;
  journey_stopped_by_name?: string | null;
  journey_stopped_at?: string | null;
  do_not_contact?: boolean;
  dnc_reason?: string | null;
}

export interface LeadListResponse {
  leads: Lead[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface LeadCreateRequest {
  // At least one of uhid, phone_number, or email is required
  // All other fields are optional
  lead_source?: LeadSource;
  name?: string;
  phone_number?: string;
  email?: string;

  // Optional fields
  lead_creation_date?: string;
  alternate_mobile_number?: string;
  employee_id?: string;
  uhid?: string;
  user_facility?: string;
  city?: string;
  pin_code?: string;
  address?: string;
  trimester?: Trimester;
  looking_for?: LookingFor;
  family_member_relation?: string;
  package_requested?: string;
  service_requested?: ServiceRequested;
  package_name_enrolled?: string;
  service_partner?: ServicePartner;
  provider_location?: string;
  hclhc_spoc?: string;
  reason_for_no_sale?: ReasonForNoSale;
  doctor_name?: string;
  doctor_speciality?: string;
  consult_date?: string;
  follow_up_date?: string;
  assigned_to?: string;

  // Medical/Clinical Details
  visit_id?: string;
  age?: number;
  gender?: string;
  icd_code?: string;
  diagnosis?: string;
  investigation_item_name?: string;
  investigation_service_type?: string;
  cug_name?: string;
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
  alternate_mobile_number?: string;
  employee_id?: string;
  uhid?: string;
  user_facility?: string;
  city?: string;
  pin_code?: string;
  address?: string;
  trimester?: Trimester;
  looking_for?: LookingFor;
  family_member_relation?: string;
  package_requested?: string;
  service_requested?: ServiceRequested;
  package_name_enrolled?: string;
  service_partner?: ServicePartner;
  provider_location?: string;
  hclhc_spoc?: string;
  reason_for_no_sale?: ReasonForNoSale;
  doctor_name?: string;
  doctor_speciality?: string;
  consult_date?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  reassign_to?: string;
  reassign_to_name?: string;

  // Medical/Clinical Details
  visit_id?: string;
  age?: number;
  gender?: string;
  icd_code?: string;
  diagnosis?: string;
  investigation_item_name?: string;
  investigation_service_type?: string;
  cug_name?: string;
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
  'Prescription Dump',
  'In Clinic-Gynae Consult',
  'In Clinic-Other Consults',
  'In Clinic-Walk In',
  'AMA',
  'BEWELL',
  'Events',
  'Call',
  'Others',
  'Bump Day',
  'WhatsApp',
  'Mail',
  'Tele-Consultation',
  'Website',
  'Habit Banner',
];

export const TRIMESTER_OPTIONS: Trimester[] = [
  'Trimester 1',
  'Trimester 2',
  'Trimester 3',
  'Not Conceived',
];

export const LOOKING_FOR_OPTIONS: LookingFor[] = ['Self', 'Family Member'];

// Standardized to 3 services. Free-solo dropdowns still display any legacy
// values stored on existing leads/enrollments; new selections come from these.
export const SERVICE_REQUESTED_OPTIONS: string[] = [
  'Antenatal',
  'PreConception',
  'MaternityWellness',
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

// Partner Center options based on Service Partner selection
export const PARTNER_CENTER_OPTIONS: Record<string, string[]> = {
  'Apollo Cradle': [
    'Kondapur - Door No 2-34/2, Plot No.1 & 6, Kothaguda X-Roads, Hyderabad - 500032',
    'Jubilee Hills - Plot No. 565, Road No. 92, Hyderabad - 500 034',
    'Chirag Enclave - Plot no. A-2, Ground Floor Outer Ring Rd, Greater Kailash-1, New Delhi, Delhi 110048',
    'Motinagar - Plot No - 15A, Nazafgarh Road, Near Haldiram, New Delhi-110015',
    'Amritsar - Naushera House, Court Road, Inside Hotel Fairfield By Marriott, Amritsar, Punjab 143001',
    'Brookefield - 101/209 & 210, ITPL Main Road, Kundalahalli, Bengaluru - 560 037',
    'Jayanagar - #25, 46th Cross, 5th Block, Near Raghavendra Swamy Mutt, Bengaluru - 560 011',
    'Koramangala - #58, 5th Cross, 18th Main, 6th Block, Near Anand Sweets, Bengaluru - 560 095',
    'Rajajinagar - 25/5, 1st Main Road, E Block Subramanya Nagar, 2nd Stage, Bengaluru, Karnataka 560010',
    'Karapakkam - 2/319, OMR Service Rd, Karapakkam, Chennai, Tamil Nadu 600097',
    'Indirapuram - NH-1, Shakti Khand 2, Indirapuram, Ghaziabad, Uttar Pradesh 201014',
    'Electronic City - 3rd floor, TVR polestar, 1669, 27th Main Rd, 2nd Sector, HSR Layout, Bengaluru, Karnataka 560102',
    'HSR Layout - 374/42/4,5,6,7,8,9,11, Hosa Road, Hosur Road, Bengaluru, Karnataka 560100',
    'Greater Noida - Pocket 7, NSG Chowk, NH-27, near IFS Villas, Greater Noida, Uttar Pradesh 201310',
  ],
  'Fortis La Femme': [
    'La Femme Greater Kailash',
  ],
  'Fortis': [
    'Fortis Hospital Noida',
    'Fortis Hospital Faridabad',
    'Fortis Hospital Greater Noida',
    'Fortis Hospital Mulund',
    'Fortis Hospital Bannerghatta Road',
    'Fortis Hospital Nagarbhavi',
    'Fortis Hospital Manesar',
    'Fortis S L Raheja Hospital',
  ],
  'Rainbow': [
    'Madhukar Rainbow Children\'s Hospital, New Delhi - FC-29, Geetanjali Marg, Near Malviya Nagar Metro Station',
    'Rosewalk, New Delhi - N-88, Block N, Panchsheel Park North',
    'Rainbow Marathalli, Bangalore - Survey No. 8/5, Marathalli-KR Puram, Outer Ring Road',
    'Rainbow Bannerghatta, Bangalore - 178/1 & 178/2, Bannerghatta Road, opposite Janardhan towers',
    'Rainbow BIAL Road, Bangalore - International Airport Road, Opp. To Kodandarama, Byatarayanapura',
    'Rainbow Bellandur, Bangalore - 3/2, Sarjapur Main Road, Next to Aishwarya Hyper City',
    'Rainbow Clinic Hennur, Bangalore - Harshini Archade, First Floor, Kothanur Main Road',
    'Rainbow Clinic Bilekahalli, Bangalore - 3rd Floor, No.562, 640, Bannerghatta Rd',
    'Rainbow Banjara Hills, Hyderabad - Road No. 2, Beside Park Hyatt, Sri Nagar Colony',
    'Rainbow Kukatpally, Hyderabad - Plot No. 1, Mumbai Highway Road, Opposite Chermas Cinemas',
    'Rainbow LB Nagar, Hyderabad - 73/C 73/D Survey No.#52, Saraswati Nagar Colony',
    'Rainbow Secunderabad, Hyderabad - H.No. 3-7-222 & 3-7-223, Main Road, Karkhana',
    'Rainbow Kondapur, Hyderabad - Plot No. 32 & 33 Survey No. 12, Opp CII Kondapur',
    'Rainbow Heart Institute, Hyderabad - Road No. 10, Banjara Hills',
    'Rainbow Financial District, Hyderabad - Survey No. 74, Financial District, Nanakramguda',
    'Rainbow Himayatnagar, Hyderabad - Old MLA Quarters Rd, AP State Housing Board',
    'Rainbow Clinic HITEC City, Hyderabad - Survey No. 9, White Field Rd, Kondapur',
    'Rainbow Clinic Attapur, Hyderabad - Shop No 302, pillar no 118, Mcube Mall, Attapur Main Rd',
    'Rainbow Guindy, Chennai - 157, Anna Salai, Near Little Mount Metro Station',
    'Rainbow Sholinganallur, Chennai - 493, OMR - ECR Link Road Toll',
    'Rainbow Annanagar, Chennai - Pillaiyar Koil St, Near VR Mall, Thirumangalam',
    'Rainbow Vijayawada - 48-10, 12/2A, service Road beside Aahaar Food Court, Nagarjuna Nagar',
    'Rainbow Clinic Vijayawada - 29-4-4, Kodandarami Reddy St, Governor Peta',
    'Rainbow Warangal - Brahmanawada, Machili Bazar, Hanamkonda',
    'Rainbow Visakhapatnam - Plot No.15A, Survey No.21 & 27 Health City, Chinnagadili',
    'Rainbow Clinic Visakhapatnam - Besides Fourpoints Hotel, 10-28-2/2/1, Waltair Uplands',
    'Pratiksha Rainbow Hospital, Guwahati - VIP Rd, Borbari',
  ],
  'Motherhood': [
    'Motherhood Indiranagar, Bengaluru - 324, Chinmaya Mission Hospital Rd, Indiranagar',
    'Motherhood Sarjapur, Bengaluru - 514/1-2-3, Kaikondara Village, opp. More mall, Sarjapur Road',
    'Motherhood Hebbal, Bengaluru - 2266/17 & 18, Service Road, G Block, Sahakara Nagar',
    'Motherhood HRBR, Bengaluru - 914, 5th A Cross Road, HRBR Layout 1st Block, Kalyan Nagar',
    'Motherhood Banashankari, Bengaluru - #4 30th Main Rd, Banashankari 3rd Stage',
    'Motherhood Electronic City, Bengaluru - #8321, Survey No 164, Neeladri Road, Electronic City Phase I',
    'Motherhood Clinic Kanakpura, Bengaluru - #3490 1st Floor, 80FT Road, Banashankari 6th Stage',
    'Motherhood Whitefield, Bangalore - 34, Whitefield Main Rd Next to Forum Value Mall',
    'Motherhood Alwarpet, Chennai - New No. 542, TTK Road, Opp. Indian Terrain',
    'Women\'s Center By Motherhood, Coimbatore - 146B, Mettupalayam Road',
    'Motherhood Kharghar, Navi Mumbai - Fountain Square Building, Sector 7, Kharghar',
    'Motherhood Kharadi, Pune - 13/1A, Kharadi Bypass Road, Next to Kothari Hyundai Showroom',
    'Motherhood Indore - Plot No 34,35,38,39, Scheme No.54, A.B Road Near Lotus Electronics',
    'Motherhood Noida - B-206 A, Block B, Sector 48, Noida, Uttar Pradesh 201301',
    'Motherhood Chaitanya Chandigarh - site No. 1 and 2, Sector 44-C, Chandigarh',
    'Motherhood Chaitanya Zirakpur - SCO 19, Kalgidhar Enclave, Baltana, Zirakpur',
    'Motherhood Lullanagar, Pune - Survey No. 3491, Plot 80, Opposite Mount Carmel School',
    'Motherhood Mysore - 50/C, Municipal door No. 3041/2, D-34/1, Yadavgiri, Devraja mohalla',
    'Motherhood Gurgaon - Plot no H-55,56,57 Sector-57, Gurugram-122011',
    'Motherhood Mohali - Cosmo MSH Building, Sector-62, SAS Nagar',
    'Motherhood Clinic Kannamangala, Bangalore - 2nd Floor, Uptown Square, Seegehalli',
    'Motherhood Noida Extension - H-03, Plot No. GC-12 & GC-14/G, Greater Noida West',
    'Motherhood Kolkata - #338, Rajdanga Main Road, Near Acropolis Mall, Kasba',
    'Motherhood Kothanur - 2nd Floor, Above Vishal Mega Market, K Narayanapura Main Road',
  ],
};

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

// Package options for Package Requested and Package Name Enrolled
export const PACKAGE_OPTIONS: string[] = [
  'Tulip Pre-Conception',
  'Tulip Antenatal',
  'Tulip Wellness',
  'Tulip Pre-Conception + Antenatal',
  'Tulip Antenatal + Wellness',
  'Tulip Pre-Conception + Antenatal + Wellness',
];
