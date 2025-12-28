import { useState } from 'react';
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
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { enrollmentService } from '../../services/enrollmentService';
import {
  CONNECT_STATUS_OPTIONS,
  ACTION_TAKEN_OPTIONS,
  SERVICE_PARTNER_OPTIONS,
  TRIMESTER_OPTIONS,
} from '../../types/enrollment.types';

const createEnrollmentSchema = z.object({
  subscriber_name: z.string().min(1, 'Subscriber name is required'),
  employee_id: z.string().min(1, 'EmployeeID is required'),
  phone_number: z
    .string()
    .min(10, 'Phone number must be 10 digits')
    .max(10, 'Phone number must be 10 digits')
    .regex(/^[6-9]\d{9}$/, 'Phone must start with 6-9 and have 10 digits'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  name: z.string().optional(),
  uhid: z.string().optional(),
  address: z.string().optional(),
  package_billed: z.string().optional(),
  hclhc_spoc: z.string().optional(),
  hcl_location: z.string().optional(),
  trimester: z.string().optional(),
  doctor_name: z.string().optional(),
  service_partner: z.string().optional(),
  partner_centre_selected: z.string().optional(),
  partner_gynaecologist: z.string().optional(),
  connect_status: z.string().optional(),
  action_taken: z.string().optional(),
  customer_feedback: z.string().optional(),
  remarks: z.string().optional(),
});

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

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreateEnrollmentFormData>({
    resolver: zodResolver(createEnrollmentSchema),
    defaultValues: {},
  });

  const handleClose = () => {
    reset();
    setBilledDate(null);
    setDob(null);
    setFollowUpDate(null);
    onClose();
  };

  const onSubmit = async (data: CreateEnrollmentFormData) => {
    setSaving(true);
    try {
      const cleanData = {
        ...data,
        email: data.email || undefined,
        trimester: data.trimester || undefined,
        doctor_name: data.doctor_name || undefined,
        service_partner: data.service_partner || undefined,
        connect_status: data.connect_status || undefined,
        action_taken: data.action_taken || undefined,
        billed_date: billedDate ? format(billedDate, 'yyyy-MM-dd') : undefined,
        dob: dob ? format(dob, 'yyyy-MM-dd') : undefined,
        follow_up_date: followUpDate ? format(followUpDate, 'yyyy-MM-dd') : undefined,
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
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                  Required Information
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  {...register('subscriber_name')}
                  fullWidth
                  label="Subscriber Name *"
                  error={!!errors.subscriber_name}
                  helperText={errors.subscriber_name?.message}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  {...register('employee_id')}
                  fullWidth
                  label="EmployeeID *"
                  error={!!errors.employee_id}
                  helperText={errors.employee_id?.message}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  {...register('phone_number')}
                  fullWidth
                  label="Phone Number *"
                  error={!!errors.phone_number}
                  helperText={errors.phone_number?.message}
                  inputProps={{ maxLength: 10 }}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  {...register('email')}
                  fullWidth
                  label="Email"
                  error={!!errors.email}
                  helperText={errors.email?.message}
                />
              </Grid>

              {/* User Details */}
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 1 }}>
                  User Details
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField {...register('name')} fullWidth label="Name" />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField {...register('uhid')} fullWidth label="UHID" />
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
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 1 }}>
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
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 1 }}>
                  HCLH Details
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField {...register('hclhc_spoc')} fullWidth label="HCLH SPOC" />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField {...register('hcl_location')} fullWidth label="HCL Location" />
              </Grid>

              {/* Service Details */}
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 1 }}>
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
                <TextField {...register('partner_centre_selected')} fullWidth label="Partner Centre Selected" />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField {...register('partner_gynaecologist')} fullWidth label="Partner Gynaecologist" />
              </Grid>

              {/* Status */}
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 1 }}>
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
