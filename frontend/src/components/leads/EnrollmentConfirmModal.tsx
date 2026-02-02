import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Grid,
  Box,
  Typography,
  IconButton,
  Divider,
  CircularProgress,
  Alert,
  Autocomplete,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format } from 'date-fns';
import { Lead } from '../../types/lead.types';
import {
  CONNECT_STATUS_OPTIONS,
  ACTION_TAKEN_OPTIONS,
  SERVICE_PARTNER_OPTIONS,
  TRIMESTER_OPTIONS,
  SERVICE_ENROLLED_OPTIONS,
  PACKAGE_OPTIONS,
} from '../../types/enrollment.types';
import { PARTNER_CENTER_OPTIONS, LeadUpdateRequest } from '../../types/lead.types';

interface EnrollmentConfirmModalProps {
  open: boolean;
  lead: Lead | null;
  currentFormData: Partial<LeadUpdateRequest>;  // Current unsaved form data
  onClose: () => void;
  onConfirm: (enrollmentData: EnrollmentPreviewData) => void;
  saving?: boolean;
}

export interface EnrollmentPreviewData {
  // User Details
  subscriber_name: string;
  employee_id: string;
  phone_number: string;
  email: string;
  uhid: string;
  name: string;
  dob: string;
  address: string;
  // Billing Info
  billed_date: string;
  package_billed: string;
  // HCLH Details
  hclhc_spoc: string;
  hcl_facility: string;
  // Service Details
  trimester: string;
  doctor_name: string;
  service_enrolled: string;
  package_name_enrolled: string;
  service_partner: string;
  partner_centre_selected: string;
  partner_gynaecologist: string;
  // Status & Follow-up
  connect_status: string;
  action_taken: string;
  follow_up_date: string;
  next_follow_up_date: string;
  customer_feedback: string;
  remarks: string;
}

export default function EnrollmentConfirmModal({
  open,
  lead,
  currentFormData,
  onClose,
  onConfirm,
  saving = false,
}: EnrollmentConfirmModalProps) {
  const [formData, setFormData] = useState<EnrollmentPreviewData>({
    subscriber_name: '',
    employee_id: '',
    phone_number: '',
    email: '',
    uhid: '',
    name: '',
    dob: '',
    address: '',
    billed_date: '',
    package_billed: '',
    hclhc_spoc: '',
    hcl_facility: '',
    trimester: '',
    doctor_name: '',
    service_enrolled: '',
    package_name_enrolled: '',
    service_partner: '',
    partner_centre_selected: '',
    partner_gynaecologist: '',
    connect_status: 'Connected',
    action_taken: '',
    follow_up_date: '',
    next_follow_up_date: '',
    customer_feedback: '',
    remarks: '',
  });

  // Date picker states
  const [billedDate, setBilledDate] = useState<Date | null>(null);
  const [dob, setDob] = useState<Date | null>(null);
  const [followUpDate, setFollowUpDate] = useState<Date | null>(null);
  const [nextFollowUpDate, setNextFollowUpDate] = useState<Date | null>(null);

  // Pre-fill form data from currentFormData (unsaved edits) when modal opens
  // Use currentFormData first (what user has been editing), fall back to lead values
  useEffect(() => {
    if (open) {
      // Prefer currentFormData values over lead values (user's unsaved edits)
      const data = currentFormData;
      setFormData({
        subscriber_name: data.name || lead?.name || '',
        employee_id: data.employee_id || lead?.employee_id || '',
        phone_number: data.phone_number || lead?.phone_number || '',
        email: data.email || lead?.email || '',
        uhid: data.uhid || lead?.uhid || '',
        name: data.name || lead?.name || '',
        dob: '',
        address: data.address || lead?.address || '',
        billed_date: '',
        package_billed: '',
        hclhc_spoc: data.hclhc_spoc || lead?.hclhc_spoc || '',
        hcl_facility: data.user_facility || lead?.user_facility || '',
        trimester: data.trimester || lead?.trimester || '',
        doctor_name: data.doctor_name || lead?.doctor_name || '',
        service_enrolled: data.service_enrolled || lead?.service_enrolled || '',
        package_name_enrolled: data.package_requested || lead?.package_requested || '',
        service_partner: data.service_partner || lead?.service_partner || '',
        partner_centre_selected: data.provider_location || lead?.provider_location || '',
        partner_gynaecologist: '',
        connect_status: 'Connected',
        action_taken: '',
        follow_up_date: '',
        next_follow_up_date: '',
        customer_feedback: '',
        remarks: '',
      });
      // Reset date pickers
      setBilledDate(null);
      setDob(null);
      setFollowUpDate(null);
      setNextFollowUpDate(null);
    }
  }, [open, lead, currentFormData]);

  const handleChange = (field: keyof EnrollmentPreviewData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleConfirm = () => {
    // Include date values in the form data
    const dataWithDates = {
      ...formData,
      billed_date: billedDate ? format(billedDate, 'yyyy-MM-dd') : '',
      dob: dob ? format(dob, 'yyyy-MM-dd') : '',
      follow_up_date: followUpDate ? format(followUpDate, 'yyyy-MM-dd') : '',
      next_follow_up_date: nextFollowUpDate ? format(nextFollowUpDate, 'yyyy-MM-dd') : '',
    };
    onConfirm(dataWithDates);
  };

  // Get partner center options based on selected service partner
  const partnerCenterOptions = formData.service_partner
    ? PARTNER_CENTER_OPTIONS[formData.service_partner] || []
    : [];

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <WarningAmberIcon color="warning" />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Confirm Enrollment
              </Typography>
            </Box>
            <IconButton onClick={onClose} size="small" disabled={saving}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        <Divider />

        <DialogContent sx={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <Alert severity="warning" sx={{ mb: 3 }}>
            <Typography variant="body2" fontWeight={600}>
              You are about to save this lead as "Enrolled"
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Once saved, this lead will become read-only and a new enrollment record will be created.
              Please review and modify the enrollment details below before confirming.
            </Typography>
          </Alert>

          <Grid container spacing={2}>
            {/* User Details */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 600, mb: 1 }}>
                User Details
              </Typography>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Subscriber Name"
                value={formData.subscriber_name}
                onChange={(e) => handleChange('subscriber_name', e.target.value)}
                size="small"
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Employee ID"
                value={formData.employee_id}
                onChange={(e) => handleChange('employee_id', e.target.value)}
                size="small"
              />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Phone Number"
                value={formData.phone_number}
                onChange={(e) => handleChange('phone_number', e.target.value)}
                size="small"
              />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                size="small"
              />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="UHID"
                value={formData.uhid}
                onChange={(e) => handleChange('uhid', e.target.value)}
                size="small"
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Name"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                size="small"
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <DatePicker
                label="Date of Birth"
                value={dob}
                onChange={setDob}
                slotProps={{ textField: { fullWidth: true, size: 'small' } }}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Address"
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                size="small"
                multiline
                rows={2}
              />
            </Grid>

            {/* Billing Info */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 600, mt: 1, mb: 1 }}>
                Billing Information
              </Typography>
            </Grid>

            <Grid item xs={12} sm={6}>
              <DatePicker
                label="Billed Date"
                value={billedDate}
                onChange={setBilledDate}
                slotProps={{ textField: { fullWidth: true, size: 'small' } }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Package Billed"
                value={formData.package_billed}
                onChange={(e) => handleChange('package_billed', e.target.value)}
                size="small"
              />
            </Grid>

            {/* HCLH Details */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 600, mt: 1, mb: 1 }}>
                HCLH Details
              </Typography>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="HCLHC SPOC"
                value={formData.hclhc_spoc}
                onChange={(e) => handleChange('hclhc_spoc', e.target.value)}
                size="small"
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="HCL Facility"
                value={formData.hcl_facility}
                onChange={(e) => handleChange('hcl_facility', e.target.value)}
                size="small"
              />
            </Grid>

            {/* Service Details */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 600, mt: 1, mb: 1 }}>
                Service Details
              </Typography>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label="Trimester"
                value={formData.trimester}
                onChange={(e) => handleChange('trimester', e.target.value)}
                size="small"
              >
                <MenuItem value="">None</MenuItem>
                {TRIMESTER_OPTIONS.map((t) => (
                  <MenuItem key={t} value={t}>
                    {t}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Doctor Name"
                value={formData.doctor_name}
                onChange={(e) => handleChange('doctor_name', e.target.value)}
                size="small"
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label="Service Enrolled"
                value={formData.service_enrolled}
                onChange={(e) => handleChange('service_enrolled', e.target.value)}
                size="small"
              >
                <MenuItem value="">None</MenuItem>
                {SERVICE_ENROLLED_OPTIONS.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label="Package Name Enrolled"
                value={formData.package_name_enrolled}
                onChange={(e) => handleChange('package_name_enrolled', e.target.value)}
                size="small"
              >
                <MenuItem value="">None</MenuItem>
                {PACKAGE_OPTIONS.map((pkg) => (
                  <MenuItem key={pkg} value={pkg}>
                    {pkg}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label="Service Partner"
                value={formData.service_partner}
                onChange={(e) => {
                  handleChange('service_partner', e.target.value);
                  handleChange('partner_centre_selected', '');
                }}
                size="small"
              >
                <MenuItem value="">None</MenuItem>
                {SERVICE_PARTNER_OPTIONS.map((p) => (
                  <MenuItem key={p} value={p}>
                    {p}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <Autocomplete
                freeSolo
                options={partnerCenterOptions}
                value={formData.partner_centre_selected}
                onChange={(_, newValue) => handleChange('partner_centre_selected', newValue || '')}
                onInputChange={(_, newInputValue) => handleChange('partner_centre_selected', newInputValue)}
                size="small"
                renderInput={(params) => (
                  <TextField
                    {...params}
                    fullWidth
                    label="Partner Centre Selected"
                    placeholder={partnerCenterOptions.length > 0 ? 'Select or type...' : 'Enter Partner Centre'}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Partner Gynaecologist"
                value={formData.partner_gynaecologist}
                onChange={(e) => handleChange('partner_gynaecologist', e.target.value)}
                size="small"
              />
            </Grid>

            {/* Status & Follow-up */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 600, mt: 1, mb: 1 }}>
                Status & Follow-up
              </Typography>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label="Connect Status"
                value={formData.connect_status}
                onChange={(e) => handleChange('connect_status', e.target.value)}
                size="small"
              >
                <MenuItem value="">None</MenuItem>
                {CONNECT_STATUS_OPTIONS.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label="Action Taken"
                value={formData.action_taken}
                onChange={(e) => handleChange('action_taken', e.target.value)}
                size="small"
              >
                <MenuItem value="">None</MenuItem>
                {ACTION_TAKEN_OPTIONS.map((a) => (
                  <MenuItem key={a} value={a}>
                    {a}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <DatePicker
                label="Follow Up Date"
                value={followUpDate}
                onChange={setFollowUpDate}
                slotProps={{ textField: { fullWidth: true, size: 'small' } }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <DatePicker
                label="Next Follow Up Date"
                value={nextFollowUpDate}
                onChange={setNextFollowUpDate}
                slotProps={{ textField: { fullWidth: true, size: 'small' } }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Customer Feedback"
                value={formData.customer_feedback}
                onChange={(e) => handleChange('customer_feedback', e.target.value)}
                size="small"
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Remarks"
                value={formData.remarks}
                onChange={(e) => handleChange('remarks', e.target.value)}
                size="small"
                multiline
                rows={2}
              />
            </Grid>
          </Grid>
        </DialogContent>

        <Divider />

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={saving} variant="outlined">
            Cancel & Go Back
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleConfirm}
            disabled={saving}
          >
            {saving ? <CircularProgress size={24} /> : 'Confirm & Go to Enrollment'}
          </Button>
        </DialogActions>
      </Dialog>
    </LocalizationProvider>
  );
}
