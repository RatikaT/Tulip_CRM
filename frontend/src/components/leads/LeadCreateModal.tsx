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
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { leadService } from '../../services/leadService';
import {
  LEAD_SOURCE_OPTIONS,
  STAGE_OPTIONS,
  LOOKING_FOR_OPTIONS,
  SERVICE_ENROLLED_OPTIONS,
} from '../../types/lead.types';

const createLeadSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone_number: z
    .string()
    .min(10, 'Phone number must be 10 digits')
    .max(10, 'Phone number must be 10 digits')
    .regex(/^[6-9]\d{9}$/, 'Phone must start with 6-9 and have 10 digits'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  lead_source: z.string().min(1, 'Lead source is required'),
  employee_id: z.string().optional(),
  uhid: z.string().optional(),
  user_facility: z.string().optional(),
  city: z.string().optional(),
  pin_code: z.string().optional(),
  address: z.string().optional(),
  stage: z.string().optional(),
  looking_for: z.string().optional(),
  package_requested: z.string().optional(),
  service_enrolled: z.string().optional(),
  package_name_enrolled: z.string().optional(),
  provider_name: z.string().optional(),
  provider_location: z.string().optional(),
  hclhc_spoc: z.string().optional(),
  doctor_name: z.string().optional(),
  assigned_to: z.string().optional(),
});

type CreateLeadFormData = z.infer<typeof createLeadSchema>;

interface LeadCreateModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function LeadCreateModal({ open, onClose, onSuccess }: LeadCreateModalProps) {
  const [saving, setSaving] = useState(false);
  const [leadCreationDate, setLeadCreationDate] = useState<Date | null>(new Date());
  const [followUpDate, setFollowUpDate] = useState<Date | null>(null);
  const [consultDate, setConsultDate] = useState<Date | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreateLeadFormData>({
    resolver: zodResolver(createLeadSchema),
    defaultValues: {
      lead_source: '',
    },
  });

  const handleClose = () => {
    reset();
    setLeadCreationDate(new Date());
    setFollowUpDate(null);
    setConsultDate(null);
    onClose();
  };

  const onSubmit = async (data: CreateLeadFormData) => {
    setSaving(true);
    try {
      // Filter out empty strings for optional enum fields
      const cleanData = {
        ...data,
        email: data.email || undefined,
        stage: data.stage || undefined,
        looking_for: data.looking_for || undefined,
        service_enrolled: data.service_enrolled || undefined,
        lead_creation_date: leadCreationDate ? format(leadCreationDate, 'yyyy-MM-dd') : undefined,
        follow_up_date: followUpDate?.toISOString(),
        consult_date: consultDate ? format(consultDate, 'yyyy-MM-dd') : undefined,
      };

      await leadService.createLead(cleanData as Parameters<typeof leadService.createLead>[0]);
      handleClose();
      onSuccess();
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to create lead';
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
              Create New Lead
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
                  {...register('name')}
                  fullWidth
                  label="Name *"
                  error={!!errors.name}
                  helperText={errors.name?.message}
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
                <Controller
                  name="lead_source"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      select
                      label="Lead Source *"
                      error={!!errors.lead_source}
                      helperText={errors.lead_source?.message}
                    >
                      {LEAD_SOURCE_OPTIONS.map((source) => (
                        <MenuItem key={source} value={source}>
                          {source}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <DatePicker
                  label="Lead Creation Date"
                  value={leadCreationDate}
                  onChange={setLeadCreationDate}
                  slotProps={{ textField: { fullWidth: true } }}
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
                <TextField {...register('employee_id')} fullWidth label="Employee ID" />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField {...register('uhid')} fullWidth label="UHID" />
              </Grid>

              {/* Location */}
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 1 }}>
                  Location
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField {...register('user_facility')} fullWidth label="User Facility" />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField {...register('city')} fullWidth label="City" />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField {...register('pin_code')} fullWidth label="PIN Code" />
              </Grid>

              <Grid item xs={12}>
                <TextField {...register('address')} fullWidth label="Address" multiline rows={2} />
              </Grid>

              {/* Lead Information */}
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 1 }}>
                  Lead Information
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="stage"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} fullWidth select label="Stage">
                      <MenuItem value="">None</MenuItem>
                      {STAGE_OPTIONS.map((stage) => (
                        <MenuItem key={stage} value={stage}>
                          {stage}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="looking_for"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} fullWidth select label="Looking For">
                      <MenuItem value="">None</MenuItem>
                      {LOOKING_FOR_OPTIONS.map((opt) => (
                        <MenuItem key={opt} value={opt}>
                          {opt}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField {...register('package_requested')} fullWidth label="Package Requested" />
              </Grid>

              <Grid item xs={12} sm={6}>
                <DateTimePicker
                  label="Follow Up Date"
                  value={followUpDate}
                  onChange={setFollowUpDate}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </Grid>

              {/* Service Details */}
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 1 }}>
                  Service Details
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="service_enrolled"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} fullWidth select label="Service Enrolled">
                      <MenuItem value="">None</MenuItem>
                      {SERVICE_ENROLLED_OPTIONS.map((service) => (
                        <MenuItem key={service} value={service}>
                          {service}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  {...register('package_name_enrolled')}
                  fullWidth
                  label="Package Name Enrolled"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField {...register('provider_name')} fullWidth label="Provider Name" />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField {...register('provider_location')} fullWidth label="Provider Location" />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField {...register('hclhc_spoc')} fullWidth label="HCLHC SPOC" />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField {...register('doctor_name')} fullWidth label="Doctor Name" />
              </Grid>

              <Grid item xs={12} sm={6}>
                <DatePicker
                  label="Consult Date"
                  value={consultDate}
                  onChange={setConsultDate}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </Grid>
            </Grid>
          </DialogContent>

          <Divider />

          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={handleClose}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? <CircularProgress size={24} /> : 'Create Lead'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </LocalizationProvider>
  );
}
