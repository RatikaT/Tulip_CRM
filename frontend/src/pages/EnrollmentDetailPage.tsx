import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  MenuItem,
  Grid,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tabs,
  Tab,
  Divider,
  CircularProgress,
  Alert,
  Autocomplete,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  ExpandMore as ExpandMoreIcon,
  Save as SaveIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { startOfDay } from 'date-fns';
import { toast } from 'react-toastify';
import { useAuthStore } from '../stores/authStore';
import CareJourneyPanel from '../components/enrollments/CareJourneyPanel';
import { toISTForPicker, fromISTPickerToUTC, formatDateIST, formatFullDateTimeIST } from '../utils/dateUtils';
import { enrollmentService } from '../services/enrollmentService';
import {
  Enrollment,
  EnrollmentUpdateRequest,
  FollowUpEntry,
  EnrollmentAuditLogEntry,
  CONNECT_STATUS_OPTIONS,
  ACTION_TAKEN_OPTIONS,
  SERVICE_PARTNER_OPTIONS,
  TRIMESTER_OPTIONS,
  SERVICE_ENROLLED_OPTIONS,
  PACKAGE_OPTIONS,
  ConnectStatus,
  ActionTaken,
} from '../types/enrollment.types';
import { PARTNER_CENTER_OPTIONS } from '../types/lead.types';
import { brandColors } from '../theme';
import api from '../services/api';

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

const connectStatusColors: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  'Connected': 'success',
  'No Response': 'warning',
  'Follow Up Required': 'primary',
  'Others': 'default',
};

// Styling for disabled/read-only fields
const disabledFieldSx = {
  '& .MuiInputBase-input.Mui-disabled': {
    WebkitTextFillColor: 'rgba(0, 0, 0, 0.6)',
    cursor: 'not-allowed',
  },
  '& .MuiOutlinedInput-root.Mui-disabled': {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    cursor: 'not-allowed',
    pointerEvents: 'none',
  },
  '& .MuiInputBase-root.Mui-disabled': {
    cursor: 'not-allowed',
    pointerEvents: 'none',
  },
};

export default function EnrollmentDetailPage() {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // Return to the originating screen (e.g. My Tasks) when set; else the Enrollments list.
  const backTarget = (location.state as { from?: string } | null)?.from || '/tulip/enrollments';
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  // SPOC-based edit flag for the Care Journey tab (mirrors EnrollmentViewModal).
  // Distinct name from the existing canEdit(field) helper to avoid a collision.
  const isFollowUpSpoc =
    user?.role === 'agent' &&
    !!enrollment?.hclhc_spoc &&
    enrollment.hclhc_spoc.trim().toLowerCase() === (user?.full_name || '').trim().toLowerCase();
  const canEditJourney = isAdmin || isFollowUpSpoc;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [auditTrail, setAuditTrail] = useState<EnrollmentAuditLogEntry[]>([]);

  // Form state for editable fields
  const [formData, setFormData] = useState<Partial<EnrollmentUpdateRequest>>({});

  // New follow-up state
  const [addingFollowUp, setAddingFollowUp] = useState(false);
  const [newFollowUp, setNewFollowUp] = useState<{
    connect_status?: ConnectStatus;
    action_taken?: ActionTaken;
    feedback?: string;
    remarks?: string;
    follow_up_date?: string;
  }>({});

  // Expanded accordions
  const [expandedSections, setExpandedSections] = useState<string[]>([
    'user-details',
    'billing-info',
    'hclh-details',
    'service-details',
  ]);

  // Users list for Assigned To dropdown
  const [users, setUsers] = useState<UserOption[]>([]);

  // Fetch users for Assigned To and HCLHC SPOC dropdowns - only users with Tulip CRM access
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
    if (enrollmentId) {
      fetchEnrollment();
    }
  }, [enrollmentId]);

  // Fetch audit trail when admin clicks on audit trail tab
  useEffect(() => {
    if (tabValue === 2 && isAdmin && enrollmentId && auditTrail.length === 0) {
      fetchAuditTrail();
    }
  }, [tabValue, isAdmin, enrollmentId]);

  const fetchEnrollment = async () => {
    if (!enrollmentId) return;
    setLoading(true);
    try {
      const data = await enrollmentService.getEnrollment(enrollmentId);
      setEnrollment(data);
      setFormData({
        subscriber_name: data.subscriber_name,
        employee_id: data.employee_id || undefined,
        phone_number: data.phone_number || undefined,
        email: data.email || undefined,
        uhid: data.uhid || undefined,
        name: data.name || undefined,
        dob: data.dob || undefined,
        address: data.address || undefined,
        billed_date: data.billed_date || undefined,
        package_billed: data.package_billed || undefined,
        hclhc_spoc: data.hclhc_spoc || undefined,
        hcl_facility: data.hcl_facility || undefined,
        doctor_name: data.doctor_name || undefined,
        trimester: data.trimester || undefined,
        service_enrolled: data.service_enrolled || undefined,
        package_name_enrolled: data.package_name_enrolled || undefined,
        service_partner: data.service_partner || undefined,
        partner_centre_selected: data.partner_centre_selected || undefined,
        partner_gynaecologist: data.partner_gynaecologist || undefined,
        connect_status: data.connect_status || undefined,
        action_taken: data.action_taken || undefined,
        follow_up_date: data.follow_up_date || undefined,
        next_follow_up_date: data.next_follow_up_date || undefined,
        customer_feedback: data.customer_feedback || undefined,
        remarks: data.remarks || undefined,
        assigned_to: data.assigned_to || undefined,
      });
      setError(null);
    } catch (err) {
      console.error('Failed to fetch enrollment:', err);
      setError('Failed to load enrollment details');
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditTrail = async () => {
    if (!enrollmentId || !isAdmin) return;
    try {
      const data = await enrollmentService.getAuditTrail(enrollmentId);
      setAuditTrail(data.audit_trail);
    } catch (err) {
      console.error('Failed to fetch audit trail:', err);
    }
  };

  const handleInputChange = (field: keyof EnrollmentUpdateRequest, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!enrollmentId) return;
    setSaving(true);
    try {
      await enrollmentService.updateEnrollment(enrollmentId, formData);
      toast.success('Enrollment updated successfully');
      fetchEnrollment();
      // Refresh audit trail if admin
      if (isAdmin) {
        setAuditTrail([]);
        if (tabValue === 2) {
          fetchAuditTrail();
        }
      }
    } catch (err) {
      console.error('Failed to update enrollment:', err);
      toast.error('Failed to update enrollment');
    } finally {
      setSaving(false);
    }
  };

  const handleAddFollowUp = async () => {
    if (!enrollmentId) return;

    // Validate next follow-up date is not in the past
    if (newFollowUp.follow_up_date) {
      const selectedDate = startOfDay(new Date(newFollowUp.follow_up_date));
      const today = startOfDay(new Date());
      if (selectedDate < today) {
        toast.error('Cannot select a past date for follow-up');
        return;
      }
    }

    setAddingFollowUp(true);
    try {
      await enrollmentService.addFollowUp(enrollmentId, newFollowUp);
      toast.success('Follow-up added successfully');
      setNewFollowUp({});
      fetchEnrollment();
      // Refresh audit trail if admin
      if (isAdmin) {
        setAuditTrail([]);
      }
    } catch (err) {
      console.error('Failed to add follow-up:', err);
      toast.error('Failed to add follow-up');
    } finally {
      setAddingFollowUp(false);
    }
  };

  const handleAccordionChange = (panel: string) => (_: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedSections((prev) =>
      isExpanded ? [...prev, panel] : prev.filter((p) => p !== panel)
    );
  };

  // Check if a follow-up date is in the past
  const isFollowUpPast = (dateStr: string | null | undefined): boolean => {
    if (!dateStr) return false;
    const followUpDate = startOfDay(new Date(dateStr));
    const today = startOfDay(new Date());
    return followUpDate < today;
  };

  // Permission-based field editing
  const canEdit = (field: string): boolean => {
    if (isAdmin) return true;
    // Agents can edit all fields except assigned_to
    const agentEditableFields = [
      // User Details
      'subscriber_name',
      'employee_id',
      'phone_number',
      'email',
      'uhid',
      'name',
      'dob',
      'address',
      // Billing Info
      'billed_date',
      'package_billed',
      // HCLH Details
      'hclhc_spoc',
      'hcl_facility',
      'doctor_name',
      // Service Details
      'trimester',
      'service_enrolled',
      'package_name_enrolled',
      'service_partner',
      'partner_centre_selected',
      'partner_gynaecologist',
      // Status Fields
      'connect_status',
      'action_taken',
      // Feedback Fields
      'customer_feedback',
      'remarks',
      'next_follow_up_date',
    ];
    return agentEditableFields.includes(field);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !enrollment) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error || 'Enrollment not found'}</Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(backTarget)} sx={{ mt: 2 }}>
          Back to Enrollments
        </Button>
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ p: 3, ...disabledFieldSx }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate(backTarget)}
            sx={{ mr: 2 }}
          >
            Back
          </Button>
          <Typography variant="h5" fontWeight={600}>
            Enrollment Details
          </Typography>
        </Box>

        {/* Enrollment Header Card */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={3}>
              <Typography variant="caption" color="text.secondary">
                Enrollment ID
              </Typography>
              <Typography variant="h6" sx={{ color: brandColors.navyBlue, fontWeight: 600 }}>
                {enrollment.enrollment_id}
              </Typography>
            </Grid>
            <Grid item xs={12} md={3}>
              <Typography variant="caption" color="text.secondary">
                Subscriber Name
              </Typography>
              <Typography variant="h6">{enrollment.subscriber_name}</Typography>
            </Grid>
            <Grid item xs={12} md={3}>
              <Typography variant="caption" color="text.secondary">
                Connect Status
              </Typography>
              <Box>
                {isAdmin ? (
                  <TextField
                    select
                    size="small"
                    value={formData.connect_status || ''}
                    onChange={(e) => handleInputChange('connect_status', e.target.value as ConnectStatus)}
                    sx={{ minWidth: 180 }}
                  >
                    <MenuItem value="">Select Status</MenuItem>
                    {CONNECT_STATUS_OPTIONS.map((option) => (
                      <MenuItem key={option} value={option}>
                        {option}
                      </MenuItem>
                    ))}
                  </TextField>
                ) : (
                  <Chip
                    label={enrollment.connect_status || 'Not Set'}
                    color={connectStatusColors[enrollment.connect_status || ''] || 'default'}
                    size="small"
                  />
                )}
              </Box>
            </Grid>
            <Grid item xs={12} md={3}>
              <Typography variant="caption" color="text.secondary">
                Created
              </Typography>
              <Typography>
                {formatDateIST(enrollment.created_at)}
              </Typography>
            </Grid>
          </Grid>
          {enrollment.linked_lead_id && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Linked Lead:{' '}
                <RouterLink to={`/tulip/leads/${enrollment.linked_lead_id}`} style={{ color: brandColors.navyBlue }}>
                  {enrollment.linked_lead_id}
                </RouterLink>
              </Typography>
            </Box>
          )}
        </Paper>

        {/* Accordion Sections */}
        {/* User Details */}
        <Accordion
          expanded={expandedSections.includes('user-details')}
          onChange={handleAccordionChange('user-details')}
          sx={{ mb: 1 }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography fontWeight={600}>User Details</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label="Subscriber Name"
                  value={formData.subscriber_name || ''}
                  onChange={(e) => handleInputChange('subscriber_name', e.target.value)}
                  disabled={!canEdit('subscriber_name')}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label="Employee ID"
                  value={formData.employee_id || ''}
                  onChange={(e) => handleInputChange('employee_id', e.target.value)}
                  disabled={!canEdit('employee_id')}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label="Contact No."
                  value={formData.phone_number || ''}
                  onChange={(e) => handleInputChange('phone_number', e.target.value)}
                  disabled={!canEdit('phone_number')}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label="Email"
                  value={formData.email || ''}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  disabled={!canEdit('email')}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label="UHID"
                  value={formData.uhid || ''}
                  onChange={(e) => handleInputChange('uhid', e.target.value)}
                  disabled={!canEdit('uhid')}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label="Name"
                  value={formData.name || ''}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  disabled={!canEdit('name')}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <DatePicker
                  label="Date of Birth"
                  value={formData.dob ? new Date(formData.dob) : null}
                  onChange={(date) => handleInputChange('dob', date?.toISOString().split('T')[0] || null)}
                  disabled={!canEdit('dob')}
                  slotProps={{ textField: { size: 'small', fullWidth: true } }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={8}>
                <TextField
                  fullWidth
                  label="Address"
                  value={formData.address || ''}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  disabled={!canEdit('address')}
                  size="small"
                  multiline
                  rows={2}
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* Billing Information */}
        <Accordion
          expanded={expandedSections.includes('billing-info')}
          onChange={handleAccordionChange('billing-info')}
          sx={{ mb: 1 }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography fontWeight={600}>Billing Information</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={4}>
                <DatePicker
                  label="Billed Date"
                  value={formData.billed_date ? new Date(formData.billed_date) : null}
                  onChange={(date) => handleInputChange('billed_date', date?.toISOString().split('T')[0] || null)}
                  disabled={!canEdit('billed_date')}
                  slotProps={{ textField: { size: 'small', fullWidth: true } }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label="Package Billed"
                  value={formData.package_billed || ''}
                  onChange={(e) => handleInputChange('package_billed', e.target.value)}
                  disabled={!canEdit('package_billed')}
                  size="small"
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* HCLH Details */}
        <Accordion
          expanded={expandedSections.includes('hclh-details')}
          onChange={handleAccordionChange('hclh-details')}
          sx={{ mb: 1 }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography fontWeight={600}>HCLH Details</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={4}>
                {canEdit('hclhc_spoc') ? (
                  <Autocomplete
                    freeSolo
                    options={users.map((u) => u.full_name)}
                    inputValue={formData.hclhc_spoc || ''}
                    onInputChange={(_, newValue) =>
                      handleInputChange('hclhc_spoc', newValue || '')
                    }
                    renderInput={(params) => (
                      <TextField {...params} fullWidth label="HCLHC SPOC" size="small" />
                    )}
                  />
                ) : (
                  <TextField
                    fullWidth
                    label="HCLHC SPOC"
                    value={formData.hclhc_spoc || ''}
                    disabled
                    size="small"
                    InputProps={{ readOnly: true }}
                  />
                )}
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label="HCL Facility"
                  value={formData.hcl_facility || ''}
                  onChange={(e) => handleInputChange('hcl_facility', e.target.value)}
                  disabled={!canEdit('hcl_facility')}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label="Doctor Name"
                  value={formData.doctor_name || ''}
                  onChange={(e) => handleInputChange('doctor_name', e.target.value)}
                  disabled={!canEdit('doctor_name')}
                  size="small"
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* Service Details */}
        <Accordion
          expanded={expandedSections.includes('service-details')}
          onChange={handleAccordionChange('service-details')}
          sx={{ mb: 1 }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography fontWeight={600}>Service Details</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  select
                  fullWidth
                  label="Trimester"
                  value={formData.trimester || ''}
                  onChange={(e) => handleInputChange('trimester', e.target.value || null)}
                  disabled={!canEdit('trimester')}
                  size="small"
                >
                  <MenuItem value="">Select Trimester</MenuItem>
                  {TRIMESTER_OPTIONS.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <Autocomplete
                  freeSolo
                  options={SERVICE_ENROLLED_OPTIONS}
                  inputValue={formData.service_enrolled || ''}
                  disabled={!canEdit('service_enrolled')}
                  onInputChange={(_, newInputValue) =>
                    handleInputChange('service_enrolled', newInputValue || null)
                  }
                  renderInput={(params) => (
                    <TextField {...params} fullWidth label="Service Enrolled" size="small" />
                  )}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  select
                  fullWidth
                  label="Package Name Enrolled"
                  value={formData.package_name_enrolled || ''}
                  onChange={(e) => handleInputChange('package_name_enrolled', e.target.value)}
                  disabled={!canEdit('package_name_enrolled')}
                  size="small"
                >
                  <MenuItem value="">Select Package</MenuItem>
                  {PACKAGE_OPTIONS.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  select
                  fullWidth
                  label="Service Partner"
                  value={formData.service_partner || ''}
                  onChange={(e) => handleInputChange('service_partner', e.target.value || null)}
                  disabled={!canEdit('service_partner')}
                  size="small"
                >
                  <MenuItem value="">Select Partner</MenuItem>
                  {SERVICE_PARTNER_OPTIONS.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <Autocomplete
                  freeSolo
                  options={formData.service_partner ? PARTNER_CENTER_OPTIONS[formData.service_partner] || [] : []}
                  value={formData.partner_centre_selected || ''}
                  onChange={(_, newValue) => handleInputChange('partner_centre_selected', newValue || '')}
                  onInputChange={(_, newInputValue) => handleInputChange('partner_centre_selected', newInputValue)}
                  disabled={!canEdit('partner_centre_selected')}
                  size="small"
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      fullWidth
                      label="Partner Centre Selected"
                      size="small"
                      placeholder={formData.service_partner && PARTNER_CENTER_OPTIONS[formData.service_partner]?.length > 0 ? "Select or type..." : "Enter Partner Centre"}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label="Partner Gynaecologist"
                  value={formData.partner_gynaecologist || ''}
                  onChange={(e) => handleInputChange('partner_gynaecologist', e.target.value)}
                  disabled={!canEdit('partner_gynaecologist')}
                  size="small"
                />
              </Grid>
              {isAdmin && (
                <Grid item xs={12} sm={6} md={4}>
                  <TextField
                    select
                    fullWidth
                    label="Assigned To"
                    value={formData.assigned_to || ''}
                    onChange={(e) => {
                      const selectedUser = users.find((u) => u.id === e.target.value);
                      handleInputChange('assigned_to', e.target.value);
                      handleInputChange('assigned_to_name', selectedUser?.full_name || '');
                    }}
                    size="small"
                  >
                    <MenuItem value="">Select User</MenuItem>
                    {users.map((u) => (
                      <MenuItem key={u.id} value={u.id}>
                        {u.full_name} ({u.role})
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
              )}
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* Tabs Section */}
        <Paper sx={{ mt: 3 }}>
          <Tabs
            value={tabValue}
            onChange={(_, newValue) => setTabValue(newValue)}
            sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
          >
            <Tab label="Follow-ups" />
            <Tab label="Remarks & Feedback" />
            <Tab label={`Care Journey (${enrollment?.journey?.length || 0})`} />
            {isAdmin && <Tab label="Audit Trail" />}
          </Tabs>

          {/* Follow-ups Tab */}
          <TabPanel value={tabValue} index={0}>
            <Box sx={{ px: 2 }}>
              {/* Add Follow-up Section */}
              <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: '#f8f9fa' }}>
                <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
                  Add New Follow-up
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      select
                      fullWidth
                      label="Connect Status"
                      value={newFollowUp.connect_status || ''}
                      onChange={(e) =>
                        setNewFollowUp({ ...newFollowUp, connect_status: e.target.value as ConnectStatus })
                      }
                      size="small"
                    >
                      <MenuItem value="">Select Status</MenuItem>
                      {CONNECT_STATUS_OPTIONS.map((option) => (
                        <MenuItem key={option} value={option}>
                          {option}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      select
                      fullWidth
                      label="Action Taken"
                      value={newFollowUp.action_taken || ''}
                      onChange={(e) =>
                        setNewFollowUp({ ...newFollowUp, action_taken: e.target.value as ActionTaken })
                      }
                      size="small"
                    >
                      <MenuItem value="">Select Action</MenuItem>
                      {ACTION_TAKEN_OPTIONS.map((option) => (
                        <MenuItem key={option} value={option}>
                          {option}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <DateTimePicker
                      label="Next Follow-up Date (IST)"
                      value={toISTForPicker(newFollowUp.follow_up_date)}
                      onChange={(date) => {
                        if (date && startOfDay(date) < startOfDay(new Date())) {
                          toast.error('Cannot select a past date for follow-up');
                          return;
                        }
                        setNewFollowUp({ ...newFollowUp, follow_up_date: fromISTPickerToUTC(date) || undefined });
                      }}
                      minDateTime={new Date()}
                      slotProps={{ textField: { size: 'small', fullWidth: true } }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Button
                      variant="contained"
                      startIcon={<AddIcon />}
                      onClick={handleAddFollowUp}
                      disabled={addingFollowUp}
                      sx={{ height: 40 }}
                    >
                      {addingFollowUp ? 'Adding...' : 'Add Follow-up'}
                    </Button>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Feedback"
                      value={newFollowUp.feedback || ''}
                      onChange={(e) => setNewFollowUp({ ...newFollowUp, feedback: e.target.value })}
                      size="small"
                      multiline
                      rows={2}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Remarks"
                      value={newFollowUp.remarks || ''}
                      onChange={(e) => setNewFollowUp({ ...newFollowUp, remarks: e.target.value })}
                      size="small"
                      multiline
                      rows={2}
                    />
                  </Grid>
                </Grid>
              </Paper>

              {/* Current Status Display */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                  Current Status
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">
                      Connect Status
                    </Typography>
                    <Typography>
                      {enrollment.connect_status || '-'}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">
                      Action Taken
                    </Typography>
                    <Typography>
                      {enrollment.action_taken || '-'}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">
                      Next Follow-up
                    </Typography>
                    <Typography>
                      {formatFullDateTimeIST(enrollment.next_follow_up_date)}
                    </Typography>
                  </Grid>
                </Grid>
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* Follow-up History */}
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
                Follow-up History ({enrollment.follow_ups?.length || 0})
              </Typography>

              {enrollment.follow_ups && enrollment.follow_ups.length > 0 ? (
                [...enrollment.follow_ups].reverse().map((followUp: FollowUpEntry, index: number) => {
                  const isPast = isFollowUpPast(followUp.date);
                  return (
                    <Paper
                      key={index}
                      variant="outlined"
                      sx={{
                        p: 2,
                        mb: 2,
                        bgcolor: isPast ? '#f5f5f5' : 'inherit',
                        opacity: isPast ? 0.7 : 1,
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="subtitle2" fontWeight={600}>
                          Follow-up #{followUp.follow_up_number}
                          {isPast && (
                            <Chip label="Past" size="small" sx={{ ml: 1 }} color="default" />
                          )}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatFullDateTimeIST(followUp.created_at)}
                        </Typography>
                      </Box>
                      <Grid container spacing={2}>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="caption" color="text.secondary">
                            Connect Status
                          </Typography>
                          <Typography variant="body2">{followUp.connect_status || '-'}</Typography>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="caption" color="text.secondary">
                            Action Taken
                          </Typography>
                          <Typography variant="body2">{followUp.action_taken || '-'}</Typography>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="caption" color="text.secondary">
                            Date
                          </Typography>
                          <Typography variant="body2">
                            {formatFullDateTimeIST(followUp.date)}
                          </Typography>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="caption" color="text.secondary">
                            Created By
                          </Typography>
                          <Typography variant="body2">{followUp.created_by_name || '-'}</Typography>
                        </Grid>
                        {followUp.feedback && (
                          <Grid item xs={12} sm={6}>
                            <Typography variant="caption" color="text.secondary">
                              Feedback
                            </Typography>
                            <Typography variant="body2">{followUp.feedback}</Typography>
                          </Grid>
                        )}
                        {followUp.remarks && (
                          <Grid item xs={12} sm={6}>
                            <Typography variant="caption" color="text.secondary">
                              Remarks
                            </Typography>
                            <Typography variant="body2">{followUp.remarks}</Typography>
                          </Grid>
                        )}
                      </Grid>
                    </Paper>
                  );
                })
              ) : (
                <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  No follow-ups recorded yet
                </Typography>
              )}
            </Box>
          </TabPanel>

          {/* Remarks & Feedback Tab */}
          <TabPanel value={tabValue} index={1}>
            <Box sx={{ px: 2 }}>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Customer Feedback"
                    value={formData.customer_feedback || ''}
                    onChange={(e) => handleInputChange('customer_feedback', e.target.value)}
                    disabled={!canEdit('customer_feedback')}
                    multiline
                    rows={4}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Remarks"
                    value={formData.remarks || ''}
                    onChange={(e) => handleInputChange('remarks', e.target.value)}
                    disabled={!canEdit('remarks')}
                    multiline
                    rows={4}
                  />
                </Grid>
              </Grid>
            </Box>
          </TabPanel>

          {/* Care Journey Tab */}
          <TabPanel value={tabValue} index={2}>
            <Box sx={{ px: 2 }}>
              {enrollment && (
                <CareJourneyPanel
                  enrollment={enrollment}
                  canEdit={canEditJourney}
                  onChanged={fetchEnrollment}
                />
              )}
            </Box>
          </TabPanel>

          {/* Audit Trail Tab (Admin only) */}
          {isAdmin && (
            <TabPanel value={tabValue} index={3}>
              <Box sx={{ px: 2 }}>
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
                              log.action === 'created'
                                ? 'success'
                                : log.action === 'deleted'
                                ? 'error'
                                : log.action === 'follow_up_added'
                                ? 'info'
                                : 'primary'
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
                              {String(change.old_value ?? 'null')} &rarr;{' '}
                              {String(change.new_value ?? 'null')}
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
              </Box>
            </TabPanel>
          )}
        </Paper>

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 3 }}>
          <Button variant="outlined" onClick={() => navigate('/tulip/enrollments')}>
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </Box>
      </Box>
    </LocalizationProvider>
  );
}
