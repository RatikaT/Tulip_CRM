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
  Autocomplete,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { leadService } from '../../services/leadService';
import { fromISTPickerToUTC } from '../../utils/dateUtils';
import { useDropdownOptions, useConditionalDropdownOptions } from '../../hooks/useDropdownOptions';

const createLeadSchema = z.object({
  name: z.string().optional(),
  phone_number: z
    .string()
    .optional()
    .refine(
      (val) => !val || (val.length === 10 && /^[6-9]\d{9}$/.test(val)),
      'Phone must start with 6-9 and have 10 digits'
    ),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  alternate_mobile_number: z.string().optional(),
  lead_source: z.string().optional(),
  employee_id: z.string().optional(),
  uhid: z.string().optional(),
  user_facility: z.string().optional(),
  city: z.string().optional(),
  pin_code: z.string().optional(),
  address: z.string().optional(),
  trimester: z.string().optional(),
  looking_for: z.string().optional(),
  family_member_relation: z.string().optional(),
  package_requested: z.string().optional(),
  service_requested: z.string().optional(),
  package_name_enrolled: z.string().optional(),
  service_partner: z.string().optional(),
  provider_location: z.string().optional(),
  hclhc_spoc: z.string().optional(),
  reason_for_no_sale: z.string().optional(),
  doctor_name: z.string().optional(),
  doctor_speciality: z.string().optional(),
  assigned_to: z.string().optional(),
  // Medical/Clinical Details
  visit_id: z.string().optional(),
  age: z.string().optional(),
  gender: z.string().optional(),
  icd_code: z.string().optional(),
  diagnosis: z.string().optional(),
  investigation_item_name: z.string().optional(),
  investigation_service_type: z.string().optional(),
  cug_name: z.string().optional(),
}).refine(
  (data) => data.uhid || data.phone_number || data.email,
  {
    message: 'At least one of UHID, Contact No., or Email is required',
    path: ['phone_number'], // Show error on phone_number field
  }
);

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

  // Dynamic dropdown options (from Configurations), with static fallback inside the hook
  const { options: LEAD_SOURCE_OPTIONS } = useDropdownOptions('lead_source');
  const { options: TRIMESTER_OPTIONS } = useDropdownOptions('trimester');
  const { options: LOOKING_FOR_OPTIONS } = useDropdownOptions('looking_for');
  const { options: SERVICE_REQUESTED_OPTIONS } = useDropdownOptions('service_requested');
  const { options: SERVICE_PARTNER_OPTIONS } = useDropdownOptions('service_partner');
  const { options: PACKAGE_OPTIONS } = useDropdownOptions('package_options');

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    formState: { errors },
  } = useForm<CreateLeadFormData>({
    resolver: zodResolver(createLeadSchema),
    defaultValues: {
      lead_source: '',
    },
  });

  // Watch looking_for to conditionally show family_member_relation field
  const lookingForValue = watch('looking_for');

  // Watch service_partner to show conditional Partner Center options
  const servicePartnerValue = watch('service_partner');
  const { options: partnerCenterOptions } = useConditionalDropdownOptions('partner_center', servicePartnerValue);

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
        lead_source: data.lead_source || undefined,
        name: data.name || undefined,
        phone_number: data.phone_number || undefined,
        email: data.email || undefined,
        alternate_mobile_number: data.alternate_mobile_number || undefined,
        employee_id: data.employee_id || undefined,
        uhid: data.uhid || undefined,
        user_facility: data.user_facility || undefined,
        city: data.city || undefined,
        pin_code: data.pin_code || undefined,
        address: data.address || undefined,
        trimester: data.trimester || undefined,
        looking_for: data.looking_for || undefined,
        family_member_relation: data.looking_for === 'Family Member' ? data.family_member_relation : undefined,
        package_requested: data.package_requested || undefined,
        service_requested: data.service_requested || undefined,
        package_name_enrolled: data.package_name_enrolled || undefined,
        service_partner: data.service_partner || undefined,
        provider_location: data.provider_location || undefined,
        hclhc_spoc: data.hclhc_spoc || undefined,
        reason_for_no_sale: data.reason_for_no_sale || undefined,
        doctor_name: data.doctor_name || undefined,
        doctor_speciality: data.doctor_speciality || undefined,
        assigned_to: data.assigned_to || undefined,
        lead_creation_date: leadCreationDate ? format(leadCreationDate, 'yyyy-MM-dd') : undefined,
        follow_up_date: fromISTPickerToUTC(followUpDate),
        consult_date: consultDate ? format(consultDate, 'yyyy-MM-dd') : undefined,
        // Medical/Clinical Details
        visit_id: data.visit_id || undefined,
        age: data.age ? parseInt(data.age) : undefined,
        gender: data.gender || undefined,
        icd_code: data.icd_code || undefined,
        diagnosis: data.diagnosis || undefined,
        investigation_item_name: data.investigation_item_name || undefined,
        investigation_service_type: data.investigation_service_type || undefined,
        cug_name: data.cug_name || undefined,
      };

      await leadService.createLead(cleanData as Parameters<typeof leadService.createLead>[0]);
      handleClose();
      onSuccess();
    } catch (error: unknown) {
      const errorData = (error as { response?: { data?: { detail?: string | Array<{loc: string[], msg: string}> } } })?.response?.data;
      let message = 'Failed to create lead';
      if (errorData?.detail) {
        if (typeof errorData.detail === 'string') {
          message = errorData.detail;
        } else if (Array.isArray(errorData.detail)) {
          // Pydantic validation errors
          message = errorData.detail.map((err: {loc: string[], msg: string}) => `${err.loc.join('.')}: ${err.msg}`).join(', ');
        }
      }
      console.error('Lead creation error:', errorData);
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
              {/* Identifier Fields */}
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, fontWeight: 600 }}>
                  Lead Identifiers (at least one of UHID, Contact No., or Email is required)
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  {...register('name')}
                  fullWidth
                  label="Name"
                  error={!!errors.name}
                  helperText={errors.name?.message || 'Optional - defaults to "Unknown"'}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  {...register('phone_number')}
                  fullWidth
                  label="Contact No."
                  error={!!errors.phone_number}
                  helperText={errors.phone_number?.message || 'One of UHID/Contact No./Email required'}
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
                      label="Lead Source"
                      error={!!errors.lead_source}
                      helperText={errors.lead_source?.message}
                    >
                      <MenuItem value="">Select Source</MenuItem>
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
                  helperText={errors.email?.message || 'One of UHID/Contact No./Email required'}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  {...register('alternate_mobile_number')}
                  fullWidth
                  label="Alternate Mobile Number"
                  placeholder="For family member inquiries"
                  inputProps={{ maxLength: 10 }}
                />
              </Grid>

              {/* User Details */}
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 1, fontWeight: 600 }}>
                  User Details
                </Typography>
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField {...register('employee_id')} fullWidth label="Employee ID" />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  {...register('uhid')}
                  fullWidth
                  label="UHID"
                  helperText="One of UHID/Contact No./Email required"
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField {...register('cug_name')} fullWidth label="CUG Name" />
              </Grid>

              {/* Location */}
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 1, fontWeight: 600 }}>
                  Location
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField {...register('user_facility')} fullWidth label="Facility Name" />
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
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 1, fontWeight: 600 }}>
                  Lead Information
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="trimester"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} fullWidth select label="Trimester">
                      <MenuItem value="">None</MenuItem>
                      {TRIMESTER_OPTIONS.map((trimester) => (
                        <MenuItem key={trimester} value={trimester}>
                          {trimester}
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

              {lookingForValue === 'Family Member' && (
                <Grid item xs={12} sm={6}>
                  <TextField
                    {...register('family_member_relation')}
                    fullWidth
                    label="Relation (e.g., Mother, Daughter, Sister, Wife)"
                    placeholder="Enter relation"
                  />
                </Grid>
              )}

              <Grid item xs={12} sm={6}>
                <Controller
                  name="package_requested"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} fullWidth select label="Package Requested">
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
                <Controller
                  name="service_requested"
                  control={control}
                  render={({ field }) => (
                    <Autocomplete
                      freeSolo
                      options={SERVICE_REQUESTED_OPTIONS}
                      value={field.value || ''}
                      onChange={(_, newValue) => field.onChange(newValue || '')}
                      onInputChange={(_, newInputValue) => field.onChange(newInputValue || '')}
                      renderInput={(params) => (
                        <TextField {...params} fullWidth label="Service Requested" />
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
                <Controller
                  name="service_partner"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} fullWidth select label="Service Partner">
                      <MenuItem value="">Select Partner</MenuItem>
                      {SERVICE_PARTNER_OPTIONS.map((partner) => (
                        <MenuItem key={partner} value={partner}>
                          {partner}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="provider_location"
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
                          label="Partner Center"
                          placeholder={partnerCenterOptions.length > 0 ? "Select or type..." : "Enter Partner Center"}
                        />
                      )}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <DateTimePicker
                  label="Follow Up Date (IST)"
                  value={followUpDate}
                  onChange={setFollowUpDate}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </Grid>

              {/* Medical/Clinical Details */}
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 1, fontWeight: 600 }}>
                  Medical/Clinical Details
                </Typography>
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField {...register('doctor_name')} fullWidth label="Treating Doctor Name" />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField {...register('doctor_speciality')} fullWidth label="Doctor Speciality/Department" />
              </Grid>

              <Grid item xs={12} sm={4}>
                <DatePicker
                  label="Consult Date"
                  value={consultDate}
                  onChange={setConsultDate}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField {...register('visit_id')} fullWidth label="Visit ID" />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  {...register('age')}
                  fullWidth
                  label="Age"
                  type="number"
                  inputProps={{ min: 0, max: 120 }}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <Controller
                  name="gender"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} fullWidth select label="Gender">
                      <MenuItem value="">Select</MenuItem>
                      <MenuItem value="Male">Male</MenuItem>
                      <MenuItem value="Female">Female</MenuItem>
                      <MenuItem value="Other">Other</MenuItem>
                    </TextField>
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField {...register('icd_code')} fullWidth label="ICD Code" />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField {...register('diagnosis')} fullWidth label="Diagnosis" />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField {...register('investigation_item_name')} fullWidth label="Investigation Item Name" />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField {...register('investigation_service_type')} fullWidth label="Investigation Service Type" />
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
