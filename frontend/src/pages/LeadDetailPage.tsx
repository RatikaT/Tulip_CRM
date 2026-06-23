import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  MenuItem,
  Grid,
  Chip,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tabs,
  Tab,
  Divider,
  CircularProgress,
  Alert,
  Autocomplete,
  Collapse,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  ExpandMore as ExpandMoreIcon,
  Save as SaveIcon,
  Add as AddIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format, startOfDay } from 'date-fns';
import { toast } from 'react-toastify';
import { useAuthStore } from '../stores/authStore';
import { formatFullDateTimeIST, formatShortDateIST, toISTForPicker, fromISTPickerToUTC } from '../utils/dateUtils';
import { leadService, RelatedLead } from '../services/leadService';
import {
  Lead,
  LeadUpdateRequest,
  CallEntry,
  Comment,
  AuditLogEntry,
} from '../types/lead.types';
import { useDropdownOptions, useConditionalDropdownOptions } from '../hooks/useDropdownOptions';
import { brandColors } from '../theme';
import api from '../services/api';
import EnrollmentConfirmModal, { EnrollmentPreviewData } from '../components/leads/EnrollmentConfirmModal';

interface UserOption {
  id: string;
  full_name: string;
  role: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

const statusColors: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  'New': 'info',
  'Not Interested': 'error',
  'Interested': 'success',
  'Lead Closed - No Response': 'default',
  'No Response': 'warning',
  'FollowUp Required': 'primary',
};

// Soft colored pill styles per lead status (matches LeadsPage design)
const RELATED_STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  'Enquiry Lead': { bg: 'rgba(30,64,136,0.10)', color: '#1E4088' },
  'Enrolled': { bg: 'rgba(16,185,129,0.12)', color: '#0f8a63' },
  'Follow up-In Process': { bg: 'rgba(245,158,11,0.14)', color: '#b26a00' },
  'Follow up-No Response': { bg: 'rgba(255,152,0,0.14)', color: '#c2410c' },
  'Not Interested': { bg: 'rgba(239,68,68,0.12)', color: '#dc2626' },
  'Lead Closed-No Response': { bg: 'rgba(100,116,139,0.12)', color: '#475569' },
  'Duplicate': { bg: 'rgba(123,75,148,0.12)', color: '#7B4B94' },
};

const getRelatedStatusChipSx = (status: string) => {
  const s = RELATED_STATUS_STYLES[status] || { bg: 'rgba(100,116,139,0.10)', color: '#475569' };
  return {
    bgcolor: s.bg,
    color: s.color,
    fontWeight: 600,
    fontSize: '0.68rem',
    height: 22,
    borderRadius: '8px',
    border: `1px solid ${s.color}33`,
    '& .MuiChip-label': { px: 0.9 },
  };
};

export default function LeadDetailPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const navigate = useNavigate();

  // Dynamic dropdown options (from Configurations), with static fallback inside the hook
  const { options: LEAD_STATUS_OPTIONS } = useDropdownOptions('lead_status');
  const { options: LEAD_SOURCE_OPTIONS } = useDropdownOptions('lead_source');
  const { options: TRIMESTER_OPTIONS } = useDropdownOptions('trimester');
  const { options: LOOKING_FOR_OPTIONS } = useDropdownOptions('looking_for');
  const { options: SERVICE_REQUESTED_OPTIONS } = useDropdownOptions('service_requested');
  const { options: SERVICE_PARTNER_OPTIONS } = useDropdownOptions('service_partner');
  const { options: REASON_FOR_NO_SALE_OPTIONS } = useDropdownOptions('reason_for_no_sale');
  const { options: PACKAGE_OPTIONS } = useDropdownOptions('package_options');
  const { allOptions: PARTNER_CENTER_OPTIONS } = useConditionalDropdownOptions('partner_center');
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [auditTrail, setAuditTrail] = useState<AuditLogEntry[]>([]);

  // Returning-customer (related leads) panel
  const [relatedLeads, setRelatedLeads] = useState<RelatedLead[]>([]);
  const [relatedExpanded, setRelatedExpanded] = useState(true);

  // Form state for editable fields
  const [formData, setFormData] = useState<Partial<LeadUpdateRequest>>({});
  const [newComment, setNewComment] = useState('');
  const [addingComment, setAddingComment] = useState(false);

  // Expanded accordions
  const [expandedSections, setExpandedSections] = useState<string[]>([
    'user-details',
    'location',
    'lead-info',
    'medical-details',
  ]);

  // Users list for Assigned To dropdown
  const [users, setUsers] = useState<UserOption[]>([]);

  // Enrollment confirmation modal state
  const [showEnrollmentModal, setShowEnrollmentModal] = useState(false);

  // Fetch users for Assigned To and Reassign dropdowns - only users with Tulip CRM access
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await api.get<{ users: UserOption[] }>('/users/dropdown', {
          params: { crm_type: 'tulip' }
        });
        setUsers(response.data.users || []);
      } catch (error) {
        console.error('Failed to fetch users:', error);
      }
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    if (leadId) {
      fetchLead();
    }
  }, [leadId]);

  // Fetch related (returning-customer) leads
  useEffect(() => {
    if (!leadId) return;
    let active = true;
    (async () => {
      try {
        const data = await leadService.getRelatedLeads(leadId);
        if (active) {
          setRelatedLeads(data.related || []);
          setRelatedExpanded(true);
        }
      } catch (error) {
        console.error('Failed to fetch related leads:', error);
        if (active) setRelatedLeads([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [leadId]);

  const fetchLead = async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const data = await leadService.getLead(leadId);
      setLead(data);
      setFormData({
        lead_source: data.lead_source || undefined,
        lead_creation_date: data.lead_creation_date || undefined,
        status: data.status,
        number_of_calls: data.number_of_calls,
        calls: data.calls,
        follow_up_date: data.follow_up_date || undefined,
        name: data.name,
        email: data.email || undefined,
        phone_number: data.phone_number,
        alternate_mobile_number: data.alternate_mobile_number || undefined,
        employee_id: data.employee_id || undefined,
        uhid: data.uhid || undefined,
        cug_name: data.cug_name || undefined,
        user_facility: data.user_facility || undefined,
        city: data.city || undefined,
        pin_code: data.pin_code || undefined,
        address: data.address || undefined,
        trimester: data.trimester || undefined,
        looking_for: data.looking_for || undefined,
        family_member_relation: data.looking_for === 'Family Member' ? (data.family_member_relation || undefined) : undefined,
        package_requested: data.package_requested || undefined,
        service_requested: data.service_requested || undefined,
        package_name_enrolled: data.package_name_enrolled || undefined,
        service_partner: data.service_partner || undefined,
        provider_location: data.provider_location || undefined,
        hclhc_spoc: data.hclhc_spoc || undefined,
        reason_for_no_sale: data.reason_for_no_sale || undefined,
        // Medical/Clinical Details
        doctor_name: data.doctor_name || undefined,
        doctor_speciality: data.doctor_speciality || undefined,
        consult_date: data.consult_date || undefined,
        visit_id: data.visit_id || undefined,
        age: data.age || undefined,
        gender: data.gender || undefined,
        icd_code: data.icd_code || undefined,
        diagnosis: data.diagnosis || undefined,
        investigation_item_name: data.investigation_item_name || undefined,
        investigation_service_type: data.investigation_service_type || undefined,
        assigned_to: data.assigned_to || undefined,
        assigned_to_name: data.assigned_to_name || undefined,
        reassign_to: data.reassign_to || data.assigned_to || undefined,
        reassign_to_name: data.reassign_to_name || data.assigned_to_name || undefined,
      });
      setError(null);
    } catch (err) {
      console.error('Failed to fetch lead:', err);
      setError('Failed to load lead details');
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditTrail = async () => {
    if (!leadId || !isAdmin) return;
    try {
      const data = await leadService.getAuditTrail(leadId);
      setAuditTrail(data.audit_trail);
    } catch (err) {
      console.error('Failed to fetch audit trail:', err);
    }
  };

  useEffect(() => {
    if (tabValue === 3 && isAdmin && leadId) {
      fetchAuditTrail();
    }
  }, [tabValue, isAdmin, leadId]);

  const handleAccordionChange = (panel: string) => (_: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedSections((prev) =>
      isExpanded ? [...prev, panel] : prev.filter((p) => p !== panel)
    );
  };

  const handleInputChange = (field: keyof LeadUpdateRequest, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleEnrollmentConfirm = async (enrollmentData: EnrollmentPreviewData) => {
    if (!leadId) return;
    setSaving(true);
    try {
      // First update lead with the enrollment data values
      const rawUpdateData: Partial<LeadUpdateRequest> = {
        ...formData,
        // Update lead fields that map to enrollment
        name: enrollmentData.subscriber_name,
        employee_id: enrollmentData.employee_id,
        phone_number: enrollmentData.phone_number,
        email: enrollmentData.email || undefined,
        uhid: enrollmentData.uhid,
        trimester: (enrollmentData.trimester as LeadUpdateRequest['trimester']) || undefined,
        doctor_name: enrollmentData.doctor_name,
        service_requested: (enrollmentData.service_enrolled as LeadUpdateRequest['service_requested']) || undefined,
        package_requested: enrollmentData.package_name_enrolled,
        service_partner: (enrollmentData.service_partner as LeadUpdateRequest['service_partner']) || undefined,
        provider_location: enrollmentData.partner_centre_selected,
        hclhc_spoc: enrollmentData.hclhc_spoc,
        // Set status to Enrolled - this will trigger backend to create enrollment
        status: 'Enrolled',
      };

      // Clean the data - convert empty strings to undefined for optional fields
      const updateData: LeadUpdateRequest = {};
      for (const [key, value] of Object.entries(rawUpdateData)) {
        if (value === '' || value === null) {
          // Skip empty strings and nulls - don't send them
          continue;
        }
        (updateData as Record<string, unknown>)[key] = value;
      }

      await leadService.updateLead(leadId, updateData);

      // Get the enrollment and update it with additional fields
      try {
        const response = await api.get(`/enrollments?linked_lead_id=${leadId}`);
        const enrollments = response.data.enrollments || [];
        if (enrollments.length > 0) {
          const enrollmentId = enrollments[0].enrollment_id;

          // Update the enrollment with additional fields from the modal
          const enrollmentUpdateData = {
            name: enrollmentData.name || undefined,
            dob: enrollmentData.dob || undefined,
            address: enrollmentData.address || undefined,
            billed_date: enrollmentData.billed_date || undefined,
            package_billed: enrollmentData.package_billed || undefined,
            hcl_facility: enrollmentData.hcl_facility || undefined,
            partner_gynaecologist: enrollmentData.partner_gynaecologist || undefined,
            connect_status: enrollmentData.connect_status || undefined,
            action_taken: enrollmentData.action_taken || undefined,
            follow_up_date: enrollmentData.follow_up_date || undefined,
            next_follow_up_date: enrollmentData.next_follow_up_date || undefined,
            customer_feedback: enrollmentData.customer_feedback || undefined,
            remarks: enrollmentData.remarks || undefined,
          };

          await api.put(`/enrollments/${enrollmentId}`, enrollmentUpdateData);

          toast.success('Lead enrolled successfully! Redirecting to enrollment...');
          setShowEnrollmentModal(false);
          navigate(`/tulip/enrollments/${enrollmentId}`);
        } else {
          toast.success('Lead enrolled successfully!');
          setShowEnrollmentModal(false);
          navigate('/tulip/enrollments');
        }
      } catch {
        toast.success('Lead enrolled successfully!');
        setShowEnrollmentModal(false);
        navigate('/tulip/enrollments');
      }
    } catch (err) {
      console.error('Failed to enroll lead:', err);
      toast.error('Failed to create enrollment');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!leadId) return;

    // If status is being changed to "Enrolled", show confirmation modal
    if (formData.status === 'Enrolled' && lead?.status !== 'Enrolled') {
      setShowEnrollmentModal(true);
      return;
    }

    setSaving(true);
    try {
      // Clean the formData - convert empty strings to undefined for optional fields
      const cleanedData: LeadUpdateRequest = {};
      for (const [key, value] of Object.entries(formData)) {
        if (value === '' || value === null) {
          // Skip empty strings and nulls - don't send them
          continue;
        }
        (cleanedData as Record<string, unknown>)[key] = value;
      }

      await leadService.updateLead(leadId, cleanedData);
      toast.success('Lead updated successfully');
      fetchLead();
    } catch (err) {
      console.error('Failed to update lead:', err);
      toast.error('Failed to update lead');
    } finally {
      setSaving(false);
    }
  };

  const handleAddComment = async () => {
    if (!leadId || !newComment.trim()) return;
    setAddingComment(true);
    try {
      await leadService.addComment(leadId, { text: newComment });
      toast.success('Comment added');
      setNewComment('');
      fetchLead();
    } catch (err) {
      console.error('Failed to add comment:', err);
      toast.error('Failed to add comment');
    } finally {
      setAddingComment(false);
    }
  };

  const handleAddCall = () => {
    const currentCalls = formData.calls || [];
    const newCallNumber = currentCalls.length + 1;
    const newCall: CallEntry = {
      call_number: newCallNumber,
      date_time: new Date().toISOString(),
      summary: '',
    };
    handleInputChange('calls', [...currentCalls, newCall]);
    handleInputChange('number_of_calls', newCallNumber);
  };

  const handleCallChange = (index: number, field: keyof CallEntry, value: unknown) => {
    // Prevent setting past dates for calls
    if (field === 'date_time' && value) {
      const selectedDate = startOfDay(new Date(value as string));
      const today = startOfDay(new Date());
      if (selectedDate < today) {
        toast.error('Cannot select a past date for calls');
        return;
      }
    }
    const updatedCalls = [...(formData.calls || [])];
    updatedCalls[index] = { ...updatedCalls[index], [field]: value };
    handleInputChange('calls', updatedCalls);
  };

  // Helper to check if a call date is in the past
  const isCallDatePast = (dateTime: string | null | undefined): boolean => {
    if (!dateTime) return false;
    const callDate = startOfDay(new Date(dateTime));
    const today = startOfDay(new Date());
    return callDate < today;
  };

  // Check if lead is enrolled (non-editable)
  const isEnrolled = lead?.status === 'Enrolled';

  const canEdit = (field: string): boolean => {
    // Enrolled leads are not editable
    if (isEnrolled) {
      return false;
    }
    // Agents cannot edit assigned_to field
    if (!isAdmin && (field === 'assigned_to' || field === 'assigned_to_name')) {
      return false;
    }
    return true;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !lead) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error || 'Lead not found'}</Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/tulip/leads')} sx={{ mt: 2 }}>
          Back to Leads
        </Button>
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <IconButton onClick={() => navigate('/tulip/leads')} sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            Lead Details
          </Typography>
        </Box>

        {/* Enrolled Lead Alert */}
        {isEnrolled && (
          <Alert severity="info" sx={{ mb: 2 }}>
            This lead has been enrolled and is now read-only. You can view the associated enrollment from the Enrollments page.
          </Alert>
        )}

        {/* Lead Header Card */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={2}>
              <Typography variant="caption" color="text.secondary">
                Lead ID
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 600, color: brandColors.navyBlue }}>
                {lead.lead_id}
              </Typography>
            </Grid>
            <Grid item xs={12} md={2}>
              <Typography variant="caption" color="text.secondary">
                Name
              </Typography>
              <Typography variant="h6">{lead.name}</Typography>
            </Grid>
            <Grid item xs={12} md={3}>
              <Typography variant="caption" color="text.secondary">
                Status
              </Typography>
              <Box sx={{ mt: 0.5 }}>
                {canEdit('status') ? (
                  <TextField
                    select
                    size="small"
                    fullWidth
                    value={formData.status || ''}
                    onChange={(e) => handleInputChange('status', e.target.value)}
                  >
                    {LEAD_STATUS_OPTIONS.map((status) => (
                      <MenuItem key={status} value={status}>
                        {status}
                      </MenuItem>
                    ))}
                  </TextField>
                ) : (
                  <Chip
                    label={lead.status}
                    color={statusColors[lead.status] || 'default'}
                    size="small"
                  />
                )}
              </Box>
            </Grid>
            <Grid item xs={12} md={3}>
              <Typography variant="caption" color="text.secondary">
                Reason for No Sale
              </Typography>
              <Box sx={{ mt: 0.5 }}>
                <TextField
                  select
                  size="small"
                  fullWidth
                  value={formData.reason_for_no_sale || ''}
                  onChange={(e) => handleInputChange('reason_for_no_sale', e.target.value)}
                  disabled={!canEdit('reason_for_no_sale')}
                >
                  <MenuItem value="">None</MenuItem>
                  {REASON_FOR_NO_SALE_OPTIONS.map((reason) => (
                    <MenuItem key={reason} value={reason}>
                      {reason}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
            </Grid>
            <Grid item xs={12} md={2}>
              <Typography variant="caption" color="text.secondary">
                Created
              </Typography>
              <Typography variant="body1">
                {formatFullDateTimeIST(lead.created_at)}
              </Typography>
            </Grid>
          </Grid>
        </Paper>

        {/* Returning Customer Panel */}
        {relatedLeads.length > 0 && (
          <Box
            sx={{
              mb: 3,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'rgba(245,158,11,0.35)',
              bgcolor: 'rgba(245,158,11,0.06)',
              boxShadow: '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)',
              overflow: 'hidden',
            }}
          >
            <Box
              onClick={() => setRelatedExpanded((v) => !v)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 2,
                py: 1.25,
                cursor: 'pointer',
                '&:hover': { bgcolor: 'rgba(245,158,11,0.10)' },
              }}
            >
              <Typography sx={{ fontWeight: 700, color: '#b26a00', fontSize: '0.9rem' }}>
                🔁 Returning customer — we've spoken to {lead.name} before ({relatedLeads.length} past lead
                {relatedLeads.length === 1 ? '' : 's'})
              </Typography>
              <IconButton size="small" sx={{ color: '#b26a00' }}>
                {relatedExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Box>
            <Collapse in={relatedExpanded}>
              <Divider sx={{ borderColor: 'rgba(245,158,11,0.25)' }} />
              <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {relatedLeads.map((rl) => (
                  <Box
                    key={rl.lead_id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 1.5,
                      px: 1.5,
                      py: 1,
                      borderRadius: 2,
                      bgcolor: '#fff',
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 72 }}>
                      {formatShortDateIST(rl.created_at)}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', minWidth: 120 }}>
                      {rl.service_requested || '—'}
                    </Typography>
                    <Chip label={rl.status} size="small" sx={getRelatedStatusChipSx(rl.status)} />
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {rl.lead_source || '—'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Handled by {rl.assigned_to_name || 'Unassigned'}
                    </Typography>
                    <Box sx={{ flexGrow: 1 }} />
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => navigate(`/tulip/leads/${rl.lead_id}`)}
                    >
                      View
                    </Button>
                  </Box>
                ))}
              </Box>
            </Collapse>
          </Box>
        )}

        {/* Collapsible Sections */}
        <Box sx={{ mb: 3 }}>
          {/* User Details */}
          <Accordion
            expanded={expandedSections.includes('user-details')}
            onChange={handleAccordionChange('user-details')}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography sx={{ fontWeight: 600 }}>User Details</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Name"
                    size="small"
                    value={formData.name || ''}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    disabled={!canEdit('name')}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Email"
                    size="small"
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    disabled={!canEdit('email')}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Contact No."
                    size="small"
                    value={formData.phone_number || ''}
                    onChange={(e) => handleInputChange('phone_number', e.target.value)}
                    disabled={!canEdit('phone_number')}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Alternate Mobile Number"
                    size="small"
                    placeholder="For family member inquiries"
                    value={formData.alternate_mobile_number || ''}
                    onChange={(e) => handleInputChange('alternate_mobile_number', e.target.value)}
                    disabled={!canEdit('alternate_mobile_number')}
                    inputProps={{ maxLength: 10 }}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Employee ID"
                    size="small"
                    value={formData.employee_id || ''}
                    onChange={(e) => handleInputChange('employee_id', e.target.value)}
                    disabled={!canEdit('employee_id')}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="UHID"
                    size="small"
                    value={formData.uhid || ''}
                    onChange={(e) => handleInputChange('uhid', e.target.value)}
                    disabled={!canEdit('uhid')}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="CUG Name"
                    size="small"
                    value={formData.cug_name || ''}
                    onChange={(e) => handleInputChange('cug_name', e.target.value)}
                    disabled={!canEdit('cug_name')}
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>

          {/* Location */}
          <Accordion
            expanded={expandedSections.includes('location')}
            onChange={handleAccordionChange('location')}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography sx={{ fontWeight: 600 }}>Location</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Facility Name"
                    size="small"
                    value={formData.user_facility || ''}
                    onChange={(e) => handleInputChange('user_facility', e.target.value)}
                    disabled={!canEdit('user_facility')}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="City"
                    size="small"
                    value={formData.city || ''}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                    disabled={!canEdit('city')}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Pin Code"
                    size="small"
                    value={formData.pin_code || ''}
                    onChange={(e) => handleInputChange('pin_code', e.target.value)}
                    disabled={!canEdit('pin_code')}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Address"
                    size="small"
                    multiline
                    rows={2}
                    value={formData.address || ''}
                    onChange={(e) => handleInputChange('address', e.target.value)}
                    disabled={!canEdit('address')}
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>

          {/* Lead Information */}
          <Accordion
            expanded={expandedSections.includes('lead-info')}
            onChange={handleAccordionChange('lead-info')}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography sx={{ fontWeight: 600 }}>Lead Information</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    select
                    label="Lead Source"
                    size="small"
                    value={formData.lead_source || ''}
                    onChange={(e) => handleInputChange('lead_source', e.target.value)}
                    disabled={!canEdit('lead_source')}
                  >
                    {LEAD_SOURCE_OPTIONS.map((source) => (
                      <MenuItem key={source} value={source}>
                        {source}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <DatePicker
                    label="Lead Creation Date"
                    value={formData.lead_creation_date ? new Date(formData.lead_creation_date) : null}
                    onChange={(date) =>
                      handleInputChange('lead_creation_date', date ? format(date, 'yyyy-MM-dd') : null)
                    }
                    disabled={!canEdit('lead_creation_date')}
                    slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    select
                    label="Trimester"
                    size="small"
                    value={formData.trimester || ''}
                    onChange={(e) => handleInputChange('trimester', e.target.value)}
                    disabled={!canEdit('trimester')}
                  >
                    <MenuItem value="">None</MenuItem>
                    {TRIMESTER_OPTIONS.map((trimester) => (
                      <MenuItem key={trimester} value={trimester}>
                        {trimester}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    select
                    label="Looking For"
                    size="small"
                    value={formData.looking_for || ''}
                    onChange={(e) => handleInputChange('looking_for', e.target.value)}
                    disabled={!canEdit('looking_for')}
                  >
                    <MenuItem value="">None</MenuItem>
                    {LOOKING_FOR_OPTIONS.map((opt) => (
                      <MenuItem key={opt} value={opt}>
                        {opt}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                {formData.looking_for === 'Family Member' && (
                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      label="Relation (e.g., Mother, Daughter, Sister, Wife)"
                      size="small"
                      placeholder="Enter relation"
                      value={formData.family_member_relation || ''}
                      onChange={(e) => handleInputChange('family_member_relation', e.target.value)}
                      disabled={!canEdit('family_member_relation')}
                    />
                  </Grid>
                )}
                <Grid item xs={12} md={4}>
                  <Autocomplete
                    freeSolo
                    options={PACKAGE_OPTIONS}
                    inputValue={formData.package_requested || ''}
                    disabled={!canEdit('package_requested')}
                    onInputChange={(_, newInputValue) =>
                      handleInputChange('package_requested', newInputValue || '')
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        fullWidth
                        label="Package Requested"
                        size="small"
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <Autocomplete
                    freeSolo
                    options={SERVICE_REQUESTED_OPTIONS}
                    inputValue={formData.service_requested || ''}
                    disabled={!canEdit('service_requested')}
                    onInputChange={(_, newInputValue) =>
                      handleInputChange('service_requested', newInputValue || '')
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        fullWidth
                        label="Service Requested"
                        size="small"
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    select
                    label="Service Partner"
                    size="small"
                    value={formData.service_partner || ''}
                    onChange={(e) => handleInputChange('service_partner', e.target.value)}
                    disabled={!canEdit('service_partner')}
                  >
                    <MenuItem value="">Select Partner</MenuItem>
                    {SERVICE_PARTNER_OPTIONS.map((partner) => (
                      <MenuItem key={partner} value={partner}>
                        {partner}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Autocomplete
                    freeSolo
                    options={formData.service_partner ? PARTNER_CENTER_OPTIONS[formData.service_partner] || [] : []}
                    value={formData.provider_location || ''}
                    onChange={(_, newValue) => handleInputChange('provider_location', newValue || '')}
                    onInputChange={(_, newInputValue) => handleInputChange('provider_location', newInputValue)}
                    disabled={!canEdit('provider_location')}
                    size="small"
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        fullWidth
                        label="Partner Center"
                        size="small"
                        placeholder={formData.service_partner && PARTNER_CENTER_OPTIONS[formData.service_partner]?.length > 0 ? "Select or type..." : "Enter Partner Center"}
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    select
                    label="Assigned To"
                    size="small"
                    value={formData.assigned_to || ''}
                    onChange={(e) => {
                      const selectedUser = users.find(u => u.id === e.target.value);
                      handleInputChange('assigned_to', e.target.value);
                      handleInputChange('assigned_to_name', selectedUser?.full_name || '');
                    }}
                    disabled={!canEdit('assigned_to')}
                  >
                    <MenuItem value="">Unassigned</MenuItem>
                    {users.map((user) => (
                      <MenuItem key={user.id} value={user.id}>
                        {user.full_name} ({user.role})
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    select
                    label="Reassign To"
                    size="small"
                    value={formData.reassign_to || ''}
                    onChange={(e) => {
                      const selectedUser = users.find(u => u.id === e.target.value);
                      handleInputChange('reassign_to', e.target.value);
                      handleInputChange('reassign_to_name', selectedUser?.full_name || '');
                    }}
                    disabled={!canEdit('reassign_to') || !formData.assigned_to}
                    helperText={!formData.assigned_to ? 'Set Assigned To first' : ''}
                  >
                    <MenuItem value="">None</MenuItem>
                    {users.map((user) => (
                      <MenuItem key={user.id} value={user.id}>
                        {user.full_name} ({user.role})
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>

          {/* Medical/Clinical Details */}
          <Accordion
            expanded={expandedSections.includes('medical-details')}
            onChange={handleAccordionChange('medical-details')}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography sx={{ fontWeight: 600 }}>Medical/Clinical Details</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Treating Doctor Name"
                    size="small"
                    value={formData.doctor_name || ''}
                    onChange={(e) => handleInputChange('doctor_name', e.target.value)}
                    disabled={!canEdit('doctor_name')}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Doctor Speciality/Department"
                    size="small"
                    value={formData.doctor_speciality || ''}
                    onChange={(e) => handleInputChange('doctor_speciality', e.target.value)}
                    disabled={!canEdit('doctor_speciality')}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <DatePicker
                    label="Consult Date"
                    value={formData.consult_date ? new Date(formData.consult_date) : null}
                    onChange={(date) =>
                      handleInputChange('consult_date', date ? format(date, 'yyyy-MM-dd') : null)
                    }
                    disabled={!canEdit('consult_date')}
                    slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Visit ID"
                    size="small"
                    value={formData.visit_id || ''}
                    onChange={(e) => handleInputChange('visit_id', e.target.value)}
                    disabled={!canEdit('visit_id')}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Age"
                    size="small"
                    type="number"
                    value={formData.age || ''}
                    onChange={(e) => handleInputChange('age', e.target.value ? parseInt(e.target.value) : undefined)}
                    disabled={!canEdit('age')}
                    inputProps={{ min: 0, max: 120 }}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    select
                    label="Gender"
                    size="small"
                    value={formData.gender || ''}
                    onChange={(e) => handleInputChange('gender', e.target.value)}
                    disabled={!canEdit('gender')}
                  >
                    <MenuItem value="">Select</MenuItem>
                    <MenuItem value="Male">Male</MenuItem>
                    <MenuItem value="Female">Female</MenuItem>
                    <MenuItem value="Other">Other</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="ICD Code"
                    size="small"
                    value={formData.icd_code || ''}
                    onChange={(e) => handleInputChange('icd_code', e.target.value)}
                    disabled={!canEdit('icd_code')}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Diagnosis"
                    size="small"
                    value={formData.diagnosis || ''}
                    onChange={(e) => handleInputChange('diagnosis', e.target.value)}
                    disabled={!canEdit('diagnosis')}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Investigation Item Name"
                    size="small"
                    value={formData.investigation_item_name || ''}
                    onChange={(e) => handleInputChange('investigation_item_name', e.target.value)}
                    disabled={!canEdit('investigation_item_name')}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Investigation Service Type"
                    size="small"
                    value={formData.investigation_service_type || ''}
                    onChange={(e) => handleInputChange('investigation_service_type', e.target.value)}
                    disabled={!canEdit('investigation_service_type')}
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Box>

        {/* Tabs Section */}
        <Paper sx={{ mb: 3 }}>
          <Tabs
            value={tabValue}
            onChange={(_, newValue) => setTabValue(newValue)}
            sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
          >
            <Tab label="Calls" />
            <Tab label="Comments" />
            <Tab label="Summary" />
            {isAdmin && <Tab label="Audit Trail" />}
          </Tabs>

          <Box sx={{ p: 2 }}>
            {/* Calls Tab */}
            <TabPanel value={tabValue} index={0}>
              <Box sx={{ mb: 2, display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                <Box>
                  <TextField
                    label="Number of Calls"
                    type="number"
                    size="small"
                    value={formData.number_of_calls || 0}
                    disabled
                    sx={{ width: 140 }}
                  />
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                    Auto-updates on Add Call
                  </Typography>
                </Box>
                <DateTimePicker
                  label="Follow Up Date (IST)"
                  value={toISTForPicker(formData.follow_up_date)}
                  onChange={(date) => {
                    if (date && startOfDay(date) < startOfDay(new Date())) {
                      toast.error('Cannot select a past date for follow up');
                      return;
                    }
                    handleInputChange('follow_up_date', fromISTPickerToUTC(date));
                  }}
                  minDateTime={new Date()}
                  disabled={!canEdit('follow_up_date')}
                  slotProps={{ textField: { size: 'small', sx: { width: 220 } } }}
                />
                {canEdit('calls') && (
                  <Button variant="outlined" startIcon={<AddIcon />} onClick={handleAddCall} sx={{ height: 40 }}>
                    Add Call
                  </Button>
                )}
              </Box>

              <Divider sx={{ my: 2 }} />

              {(formData.calls || []).map((call, index) => {
                const isPastCall = isCallDatePast(call.date_time);
                return (
                  <Paper
                    key={index}
                    variant="outlined"
                    sx={{
                      p: 2,
                      mb: 2,
                      bgcolor: isPastCall ? '#f5f5f5' : 'inherit',
                      opacity: isPastCall ? 0.7 : 1,
                    }}
                  >
                    <Grid container spacing={2} alignItems="center">
                      <Grid item xs={12} md={1}>
                        <Typography variant="subtitle2" color={isPastCall ? 'text.secondary' : 'primary'}>
                          Call {call.call_number}
                          {isPastCall && (
                            <Typography variant="caption" display="block" color="text.secondary">
                              (Past)
                            </Typography>
                          )}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <DateTimePicker
                          label="Date & Time (IST)"
                          value={toISTForPicker(call.date_time)}
                          onChange={(date) =>
                            handleCallChange(index, 'date_time', fromISTPickerToUTC(date))
                          }
                          minDateTime={new Date()}
                          disabled={!canEdit('calls') || isPastCall}
                          slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                        />
                      </Grid>
                      <Grid item xs={12} md={7}>
                        <TextField
                          fullWidth
                          label="Summary"
                          size="small"
                          multiline
                          rows={2}
                          value={call.summary || ''}
                          onChange={(e) => handleCallChange(index, 'summary', e.target.value)}
                          disabled={!canEdit('calls') || isPastCall}
                          helperText={isPastCall ? 'Cannot edit past call summary' : ''}
                        />
                      </Grid>
                    </Grid>
                  </Paper>
                );
              })}

              {(!formData.calls || formData.calls.length === 0) && (
                <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  No calls recorded yet
                </Typography>
              )}
            </TabPanel>

            {/* Comments Tab */}
            <TabPanel value={tabValue} index={1}>
              <Box sx={{ mb: 3 }}>
                <TextField
                  fullWidth
                  label="Add a comment"
                  multiline
                  rows={3}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Type your comment here..."
                />
                <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="contained"
                    onClick={handleAddComment}
                    disabled={!newComment.trim() || addingComment}
                  >
                    {addingComment ? 'Adding...' : 'Add Comment'}
                  </Button>
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              {lead.comments && lead.comments.length > 0 ? (
                [...lead.comments].reverse().map((comment: Comment, index: number) => (
                  <Paper key={index} variant="outlined" sx={{ p: 2, mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="subtitle2" color="primary">
                        {comment.created_by_name || 'Unknown'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {comment.created_at
                          ? formatFullDateTimeIST(comment.created_at)
                          : ''}
                      </Typography>
                    </Box>
                    <Typography variant="body2">{comment.text}</Typography>
                  </Paper>
                ))
              ) : (
                <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  No comments yet
                </Typography>
              )}
            </TabPanel>

            {/* Summary Tab */}
            <TabPanel value={tabValue} index={2}>
              <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                AI-generated summary will appear here
              </Typography>
            </TabPanel>

            {/* Audit Trail Tab (Admin only) */}
            {isAdmin && (
              <TabPanel value={tabValue} index={3}>
                {auditTrail.length > 0 ? (
                  auditTrail.map((log, index) => (
                    <Paper key={index} variant="outlined" sx={{ p: 2, mb: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Box>
                          <Typography variant="subtitle2" color="primary">
                            {log.user_name || log.user_email}
                          </Typography>
                          <Chip
                            label={log.action}
                            size="small"
                            color={
                              log.action === 'CREATED'
                                ? 'success'
                                : log.action === 'DELETED'
                                ? 'error'
                                : 'info'
                            }
                            sx={{ mt: 0.5 }}
                          />
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {formatFullDateTimeIST(log.timestamp)}
                        </Typography>
                      </Box>
                      {log.changes && log.changes.length > 0 && (
                        <Box sx={{ mt: 1 }}>
                          {log.changes.map((change, idx) => (
                            <Typography key={idx} variant="body2" color="text.secondary">
                              <strong>{change.field}:</strong>{' '}
                              {String(change.old_value || 'null')} &rarr;{' '}
                              {String(change.new_value || 'null')}
                            </Typography>
                          ))}
                        </Box>
                      )}
                    </Paper>
                  ))
                ) : (
                  <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                    No audit trail available
                  </Typography>
                )}
              </TabPanel>
            )}
          </Box>
        </Paper>

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
          <Button variant="outlined" onClick={() => navigate('/tulip/leads')}>
            {isEnrolled ? 'Back to Leads' : 'Cancel'}
          </Button>
          {!isEnrolled && (
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
        </Box>
      </Box>

      {/* Enrollment Confirmation Modal */}
      <EnrollmentConfirmModal
        open={showEnrollmentModal}
        lead={lead}
        currentFormData={formData}
        onClose={() => setShowEnrollmentModal(false)}
        onConfirm={handleEnrollmentConfirm}
        saving={saving}
      />
    </LocalizationProvider>
  );
}
