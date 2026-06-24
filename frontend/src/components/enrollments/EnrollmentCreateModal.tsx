import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
  Autocomplete,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { enrollmentService } from '../../services/enrollmentService';
import api from '../../services/api';
import {
  CONNECT_STATUS_OPTIONS,
  ACTION_TAKEN_OPTIONS,
  SERVICE_PARTNER_OPTIONS,
  TRIMESTER_OPTIONS,
  SERVICE_ENROLLED_OPTIONS,
  PACKAGE_OPTIONS,
} from '../../types/enrollment.types';
import { PARTNER_CENTER_OPTIONS } from '../../types/lead.types';

interface UserOption {
  id: string;
  full_name: string;
  email: string;
}

const createEnrollmentSchema = z.object({
  subscriber_name: z.string().optional().or(z.literal('')),
  employee_id: z.string().optional().or(z.literal('')),
  phone_number: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine(
      (val) => !val || (val.length === 10 && /^[6-9]\d{9}$/.test(val)),
      'Contact No. must start with 6-9 and have 10 digits'
    ),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  name: z.string().optional(),
  uhid: z.string().optional().or(z.literal('')),
  address: z.string().optional(),
  package_billed: z.string().optional(),
  hclhc_spoc: z.string().optional(),
  hcl_facility: z.string().optional(),
  trimester: z.string().optional(),
  service_enrolled: z.string().optional(),
  package_name_enrolled: z.string().optional(),
  doctor_name: z.string().optional(),
  service_partner: z.string().optional(),
  partner_centre_selected: z.string().optional(),
  partner_gynaecologist: z.string().optional(),
  connect_status: z.string().optional(),
  action_taken: z.string().optional(),
  customer_feedback: z.string().optional(),
  remarks: z.string().optional(),
}).refine(
  (data) => data.email || data.uhid || data.phone_number,
  {
    message: 'At least one of Email, UHID, or Contact No. is required',
    path: ['phone_number'],
  }
);

type CreateEnrollmentFormData = z.infer<typeof createEnrollmentSchema>;

interface EnrollmentCreateModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EnrollmentCreateModal({ open, onClose, onSuccess }: EnrollmentCreateModalProps) {
  const [saving, setSaving] = useState(false);
  const [billedDate, setBilledDate] = useState<Date | null>(null);
  const [dob, setDob] = useState<Date | null>(null);
  const [followUpDate, setFollowUpDate] = useState<Date | null>(null);
  const [nextFollowUpDate, setNextFollowUpDate] = useState<Date | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedSpoc, setSelectedSpoc] = useState<UserOption | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateEnrollmentFormData>({
    resolver: zodResolver(createEnrollmentSchema),
    defaultValues: {},
  });

  // Watch service_partner to show conditional Partner Centre options
  const servicePartnerValue = watch('service_partner');
  const partnerCenterOptions = servicePartnerValue ? PARTNER_CENTER_OPTIONS[servicePartnerValue] || [] : [];

  // Fetch users for HCLHC SPOC dropdown - only users with Tulip CRM access
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
    if (open) {
      fetchUsers();
    }
  }, [open]);

  const handleClose = () => {
    reset();
    setBilledDate(null);
    setDob(null);
    setFollowUpDate(null);
    setNextFollowUpDate(null);
    setSelectedSpoc(null);
    onClose();
  };

  const onSubmit = async (data: CreateEnrollmentFormData) => {
    setSaving(true);
    try {
      const cleanData = {
        ...data,
        subscriber_name: data.subscriber_name || undefined,
        employee_id: data.employee_id || undefined,
        email: data.email || undefined,
        uhid: data.uhid || undefined,
        phone_number: data.phone_number || undefined,
        name: data.name || undefined,
        address: data.address || undefined,
        package_billed: data.package_billed || undefined,
        hclhc_spoc: data.hclhc_spoc || undefined,
        hcl_facility: data.hcl_facility || undefined,
        trimester: data.trimester || undefined,
        service_enrolled: data.service_enrolled || undefined,
        package_name_enrolled: data.package_name_enrolled || undefined,
        doctor_name: data.doctor_name || undefined,
        service_partner: data.service_partner || undefined,
        partner_centre_selected: data.partner_centre_selected || undefined,
        partner_gynaecologist: data.partner_gynaecologist || undefined,
        connect_status: data.connect_status || undefined,
        action_taken: data.action_taken || undefined,
        customer_feedback: data.customer_feedback || undefined,
        remarks: data.remarks || undefined,
        billed_date: billedDate ? format(billedDate, 'yyyy-MM-dd') : undefined,
        dob: dob ? format(dob, 'yyyy-MM-dd') : undefined,
        follow_up_date: followUpDate ? format(followUpDate, 'yyyy-MM-dd') : undefined,
        next_follow_up_date: nextFollowUpDate ? format(nextFollowUpDate, 'yyyy-MM-dd') : undefined,
      };

      await enrollmentService.createEnrollment(cleanData as Parameters<typeof enrollmentService.createEnrollment>[0]);
      handleClose();
      onSuccess();
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to create enrollment';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Create New Enrollment
            </Typography>
            <IconButton onClick={handleClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        <Divider />

        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogContent>
            <Grid container spacing={2}>
              {/* Required Fields */}
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, fontWeight: 600 }}>
                  Required Information
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  {...register('subscriber_name')}
                  fullWidth
                  label="Subscriber Name"
                  error={!!errors.subscriber_name}
                  helperText={errors.subscriber_name?.message}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  {...register('employee_id')}
                  fullWidth
                  label="EmployeeID"
                  error={!!errors.employee_id}
                  helperText={errors.employee_id?.message}
                />
              </Grid>

              {/* At least one identifier required */}
              <Grid item xs={12}>
                <Typography variant="caption" color="primary" sx={{ fontStyle: 'italic' }}>
                  At least one of Email, UHID, or Contact No. is required
                </Typography>
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  {...register('email')}
                  fullWidth
                  label="Email"
                  error={!!errors.email}
                  helperText={errors.email?.message}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  {...register('uhid')}
                  fullWidth
                  label="UHID"
                  error={!!errors.uhid}
                  helperText={errors.uhid?.message}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  {...register('phone_number')}
                  fullWidth
                  label="Contact No."
                  error={!!errors.phone_number}
                  helperText={errors.phone_number?.message}
                  inputProps={{ maxLength: 10 }}
                />
              </Grid>

              {/* User Details */}
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 1, fontWeight: 600 }}>
                  User Details
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField {...register('name')} fullWidth label="Name" />
              </Grid>

              <Grid item xs={12} sm={6}>
                <DatePicker
                  label="Date of Birth"
                  value={dob}
                  onChange={setDob}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </Grid>

              <Grid item xs={12}>
                <TextField {...register('address')} fullWidth label="Address" multiline rows={2} />
              </Grid>

              {/* Billing Info */}
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 1, fontWeight: 600 }}>
                  Billing Information
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <DatePicker
                  label="Billed Date"
                  value={billedDate}
                  onChange={setBilledDate}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField {...register('package_billed')} fullWidth label="Package Billed" />
              </Grid>

              {/* HCLH Details */}
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 1, fontWeight: 600 }}>
                  HCLH Details
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Autocomplete
                  options={users}
                  getOptionLabel={(option) => option.full_name}
                  value={selectedSpoc}
                  onChange={(_, newValue) => {
                    setSelectedSpoc(newValue);
                    setValue('hclhc_spoc', newValue?.full_name || '');
                  }}
                  renderInput={(params) => (
                    <TextField {...params} fullWidth label="HCLH SPOC" />
                  )}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField {...register('hcl_facility')} fullWidth label="HCL Facility" />
              </Grid>

              {/* Service Details */}
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 1, fontWeight: 600 }}>
                  Service Details
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="trimester"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} fullWidth select label="Current Trimester">
                      <MenuItem value="">None</MenuItem>
                      {TRIMESTER_OPTIONS.map((t) => (
                        <MenuItem key={t} value={t}>
                          {t}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="service_enrolled"
                  control={control}
                  render={({ field }) => (
                    <Autocomplete
                      freeSolo
                      options={SERVICE_ENROLLED_OPTIONS}
                      value={field.value || ''}
                      onChange={(_, newValue) => field.onChange(newValue || '')}
                      onInputChange={(_, newInputValue) => field.onChange(newInputValue || '')}
                      renderInput={(params) => (
                        <TextField {...params} fullWidth label="Service Enrolled" />
                      )}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="package_name_enrolled"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} fullWidth select label="Package Name Enrolled">
                      <MenuItem value="">None</MenuItem>
                      {PACKAGE_OPTIONS.map((pkg) => (
                        <MenuItem key={pkg} value={pkg}>
                          {pkg}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField {...register('doctor_name')} fullWidth label="Doctor Name" />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="service_partner"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} fullWidth select label="Service Partner">
                      <MenuItem value="">None</MenuItem>
                      {SERVICE_PARTNER_OPTIONS.map((p) => (
                        <MenuItem key={p} value={p}>
                          {p}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="partner_centre_selected"
                  control={control}
                  render={({ field }) => (
                    <Autocomplete
                      freeSolo
                      options={partnerCenterOptions}
                      value={field.value || ''}
                      onChange={(_, newValue) => field.onChange(newValue || '')}
                      onInputChange={(_, newInputValue) => field.onChange(newInputValue)}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          fullWidth
                          label="Partner Centre Selected"
                          placeholder={partnerCenterOptions.length > 0 ? "Select or type..." : "Enter Partner Centre"}
                        />
                      )}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField {...register('partner_gynaecologist')} fullWidth label="Partner Gynaecologist" />
              </Grid>

              {/* Status */}
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 1, fontWeight: 600 }}>
                  Status & Follow-up
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="connect_status"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} fullWidth select label="Connect Status">
                      <MenuItem value="">None</MenuItem>
                      {CONNECT_STATUS_OPTIONS.map((s) => (
                        <MenuItem key={s} value={s}>
                          {s}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="action_taken"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} fullWidth select label="Action Taken">
                      <MenuItem value="">None</MenuItem>
                      {ACTION_TAKEN_OPTIONS.map((a) => (
                        <MenuItem key={a} value={a}>
                          {a}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <DatePicker
                  label="Follow Up Date"
                  value={followUpDate}
                  onChange={setFollowUpDate}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <DatePicker
                  label="Next Follow Up Date"
                  value={nextFollowUpDate}
                  onChange={setNextFollowUpDate}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField {...register('customer_feedback')} fullWidth label="Customer Feedback" />
              </Grid>

              <Grid item xs={12}>
                <TextField {...register('remarks')} fullWidth label="Remarks" multiline rows={2} />
              </Grid>
            </Grid>
          </DialogContent>

          <Divider />

          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={handleClose}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? <CircularProgress size={24} /> : 'Create Enrollment'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </LocalizationProvider>
  );
}
