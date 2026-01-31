import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
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
  Tabs,
  Tab,
  Paper,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Autocomplete,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format, parseISO } from 'date-fns';
import { toast } from 'react-toastify';
import { useAuthStore } from '../../stores/authStore';
import { formatDateTimeIST, formatShortDateIST } from '../../utils/dateUtils';
import { enrollmentService } from '../../services/enrollmentService';
import api from '../../services/api';
import {
  Enrollment,
  FollowUpEntry,
  CONNECT_STATUS_OPTIONS,
  ACTION_TAKEN_OPTIONS,
  SERVICE_PARTNER_OPTIONS,
  TRIMESTER_OPTIONS,
  SERVICE_ENROLLED_OPTIONS,
  PACKAGE_OPTIONS,
} from '../../types/enrollment.types';

interface UserOption {
  id: string;
  full_name: string;
  email: string;
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
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

interface EnrollmentViewModalProps {
  open: boolean;
  enrollment: Enrollment;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EnrollmentViewModal({ open, enrollment, onClose, onSuccess }: EnrollmentViewModalProps) {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const canEdit = isAdmin || user?.role === 'agent'; // Agents can also edit

  const [tabValue, setTabValue] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAddFollowUp, setShowAddFollowUp] = useState(false);

  // Form state
  const [billedDate, setBilledDate] = useState<Date | null>(null);
  const [dob, setDob] = useState<Date | null>(null);
  const [followUpDate, setFollowUpDate] = useState<Date | null>(null);
  const [nextFollowUpDate, setNextFollowUpDate] = useState<Date | null>(null);

  // Follow-up form state
  const [newFollowUp, setNewFollowUp] = useState({
    connect_status: '',
    action_taken: '',
    feedback: '',
    remarks: '',
    follow_up_date: null as Date | null,
  });

  // Users for HCLHC SPOC dropdown
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedSpoc, setSelectedSpoc] = useState<UserOption | null>(null);

  const { register, handleSubmit, control, setValue } = useForm();

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
    if (open && editMode) {
      fetchUsers();
    }
  }, [open, editMode]);

  useEffect(() => {
    if (enrollment) {
      // Set form values
      setValue('subscriber_name', enrollment.subscriber_name);
      setValue('employee_id', enrollment.employee_id);
      setValue('phone_number', enrollment.phone_number);
      setValue('email', enrollment.email || '');
      setValue('name', enrollment.name || '');
      setValue('uhid', enrollment.uhid || '');
      setValue('address', enrollment.address || '');
      setValue('package_billed', enrollment.package_billed || '');
      setValue('hclhc_spoc', enrollment.hclhc_spoc || '');
      setValue('hcl_facility', enrollment.hcl_facility || '');
      setValue('trimester', enrollment.trimester || '');
      setValue('service_enrolled', enrollment.service_enrolled || '');
      setValue('package_name_enrolled', enrollment.package_name_enrolled || '');
      setValue('doctor_name', enrollment.doctor_name || '');
      setValue('service_partner', enrollment.service_partner || '');
      setValue('partner_centre_selected', enrollment.partner_centre_selected || '');
      setValue('partner_gynaecologist', enrollment.partner_gynaecologist || '');
      setValue('connect_status', enrollment.connect_status || '');
      setValue('action_taken', enrollment.action_taken || '');
      setValue('customer_feedback', enrollment.customer_feedback || '');
      setValue('remarks', enrollment.remarks || '');

      // Set dates
      setBilledDate(enrollment.billed_date ? parseISO(enrollment.billed_date) : null);
      setDob(enrollment.dob ? parseISO(enrollment.dob) : null);
      setFollowUpDate(enrollment.follow_up_date ? parseISO(enrollment.follow_up_date) : null);
      setNextFollowUpDate(enrollment.next_follow_up_date ? parseISO(enrollment.next_follow_up_date) : null);

      // Set selected SPOC user (will be matched when users are loaded)
      if (enrollment.hclhc_spoc && users.length > 0) {
        const matchedUser = users.find(u => u.full_name === enrollment.hclhc_spoc);
        setSelectedSpoc(matchedUser || null);
      }
    }
  }, [enrollment, setValue, users]);

  const handleClose = () => {
    setEditMode(false);
    setShowAddFollowUp(false);
    setTabValue(0);
    setSelectedSpoc(null);
    onClose();
  };

  const onSubmit = async (data: Record<string, string>) => {
    setSaving(true);
    try {
      const updateData = {
        subscriber_name: data.subscriber_name || undefined,
        employee_id: data.employee_id || undefined,
        phone_number: data.phone_number || undefined,
        email: data.email || undefined,
        name: data.name || undefined,
        uhid: data.uhid || undefined,
        address: data.address || undefined,
        package_billed: data.package_billed || undefined,
        hclhc_spoc: data.hclhc_spoc || undefined,
        hcl_facility: data.hcl_facility || undefined,
        doctor_name: data.doctor_name || undefined,
        partner_centre_selected: data.partner_centre_selected || undefined,
        partner_gynaecologist: data.partner_gynaecologist || undefined,
        customer_feedback: data.customer_feedback || undefined,
        remarks: data.remarks || undefined,
        trimester: (data.trimester as import('../../types/enrollment.types').Trimester) || undefined,
        service_enrolled: (data.service_enrolled as import('../../types/enrollment.types').ServiceEnrolled) || undefined,
        package_name_enrolled: data.package_name_enrolled || undefined,
        service_partner: (data.service_partner as import('../../types/enrollment.types').ServicePartner) || undefined,
        connect_status: (data.connect_status as import('../../types/enrollment.types').ConnectStatus) || undefined,
        action_taken: (data.action_taken as import('../../types/enrollment.types').ActionTaken) || undefined,
        billed_date: billedDate ? format(billedDate, 'yyyy-MM-dd') : undefined,
        dob: dob ? format(dob, 'yyyy-MM-dd') : undefined,
        follow_up_date: followUpDate ? format(followUpDate, 'yyyy-MM-dd') : undefined,
        next_follow_up_date: nextFollowUpDate ? format(nextFollowUpDate, 'yyyy-MM-dd') : undefined,
      };

      await enrollmentService.updateEnrollment(enrollment.enrollment_id, updateData);
      setEditMode(false);
      onSuccess();
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to update enrollment';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddFollowUp = async () => {
    setSaving(true);
    try {
      await enrollmentService.addFollowUp(enrollment.enrollment_id, {
        connect_status: (newFollowUp.connect_status as import('../../types/enrollment.types').ConnectStatus) || undefined,
        action_taken: (newFollowUp.action_taken as import('../../types/enrollment.types').ActionTaken) || undefined,
        feedback: newFollowUp.feedback || undefined,
        remarks: newFollowUp.remarks || undefined,
        follow_up_date: newFollowUp.follow_up_date ? format(newFollowUp.follow_up_date, 'yyyy-MM-dd') : undefined,
      });
      setShowAddFollowUp(false);
      setNewFollowUp({ connect_status: '', action_taken: '', feedback: '', remarks: '', follow_up_date: null });
      toast.success('Follow-up added successfully');
      onSuccess();
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to add follow-up';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const InfoRow = ({ label, value }: { label: string; value: string | null | undefined }) => (
    <Grid item xs={12} sm={6}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2">{value || '-'}</Typography>
    </Grid>
  );

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {enrollment.enrollment_id}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {enrollment.subscriber_name} | {enrollment.employee_id}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {canEdit && !editMode && (
                <IconButton onClick={() => setEditMode(true)} color="primary" size="small">
                  <EditIcon />
                </IconButton>
              )}
              <IconButton onClick={handleClose} size="small">
                <CloseIcon />
              </IconButton>
            </Box>
          </Box>
        </DialogTitle>

        <Divider />

        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ px: 2 }}>
          <Tab label="Details" />
          <Tab label={`Follow-ups (${enrollment.follow_ups?.length || 0})`} />
        </Tabs>

        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogContent>
            <TabPanel value={tabValue} index={0}>
              {editMode ? (
                <Grid container spacing={2}>
                  {/* Edit Form */}
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                      User Details
                    </Typography>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <TextField {...register('subscriber_name')} fullWidth label="Subscriber Name" size="small" />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField {...register('employee_id')} fullWidth label="EmployeeID" size="small" />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField {...register('phone_number')} fullWidth label="Contact No." size="small" />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField {...register('email')} fullWidth label="Email" size="small" />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField {...register('name')} fullWidth label="Name" size="small" />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField {...register('uhid')} fullWidth label="UHID" size="small" />
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
                    <TextField {...register('address')} fullWidth label="Address" size="small" multiline rows={2} />
                  </Grid>

                  <Grid item xs={12}>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 1 }}>
                      Billing & HCLH
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
                    <TextField {...register('package_billed')} fullWidth label="Package Billed" size="small" />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Autocomplete
                      size="small"
                      options={users}
                      getOptionLabel={(option) => option.full_name}
                      value={selectedSpoc}
                      onChange={(_, newValue) => {
                        setSelectedSpoc(newValue);
                        setValue('hclhc_spoc', newValue?.full_name || '');
                      }}
                      renderInput={(params) => (
                        <TextField {...params} fullWidth label="HCLHC SPOC" />
                      )}
                      isOptionEqualToValue={(option, value) => option.id === value.id}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField {...register('hcl_facility')} fullWidth label="HCL Facility" size="small" />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField {...register('doctor_name')} fullWidth label="Doctor Name" size="small" />
                  </Grid>

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
                        <TextField {...field} fullWidth select label="Trimester" size="small">
                          <MenuItem value="">None</MenuItem>
                          {TRIMESTER_OPTIONS.map((t) => (
                            <MenuItem key={t} value={t}>{t}</MenuItem>
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
                        <TextField {...field} fullWidth select label="Service Enrolled" size="small">
                          <MenuItem value="">None</MenuItem>
                          {SERVICE_ENROLLED_OPTIONS.map((s) => (
                            <MenuItem key={s} value={s}>{s}</MenuItem>
                          ))}
                        </TextField>
                      )}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Controller
                      name="package_name_enrolled"
                      control={control}
                      render={({ field }) => (
                        <TextField {...field} fullWidth select label="Package Name Enrolled" size="small">
                          <MenuItem value="">None</MenuItem>
                          {PACKAGE_OPTIONS.map((pkg) => (
                            <MenuItem key={pkg} value={pkg}>{pkg}</MenuItem>
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
                        <TextField
                          {...field}
                          fullWidth
                          select
                          label="Service Partner"
                          size="small"
                          value={field.value ? (typeof field.value === 'string' ? field.value.split(', ').filter(Boolean) : field.value) : []}
                          onChange={(e) => {
                            const value = e.target.value;
                            field.onChange(Array.isArray(value) ? value.join(', ') : value);
                          }}
                          SelectProps={{
                            multiple: true,
                            renderValue: (selected) => (Array.isArray(selected) ? selected.join(', ') : selected),
                          }}
                        >
                          {SERVICE_PARTNER_OPTIONS.map((p) => (
                            <MenuItem key={p} value={p}>{p}</MenuItem>
                          ))}
                        </TextField>
                      )}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField {...register('partner_centre_selected')} fullWidth label="Partner Centre" size="small" />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField {...register('partner_gynaecologist')} fullWidth label="Partner Gynaecologist" size="small" />
                  </Grid>

                  <Grid item xs={12}>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 1 }}>
                      Status
                    </Typography>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <Controller
                      name="connect_status"
                      control={control}
                      render={({ field }) => (
                        <TextField {...field} fullWidth select label="Connect Status" size="small">
                          <MenuItem value="">None</MenuItem>
                          {CONNECT_STATUS_OPTIONS.map((s) => (
                            <MenuItem key={s} value={s}>{s}</MenuItem>
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
                        <TextField {...field} fullWidth select label="Action Taken" size="small">
                          <MenuItem value="">None</MenuItem>
                          {ACTION_TAKEN_OPTIONS.map((a) => (
                            <MenuItem key={a} value={a}>{a}</MenuItem>
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
                    <TextField {...register('customer_feedback')} fullWidth label="Customer Feedback" size="small" />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField {...register('remarks')} fullWidth label="Remarks" size="small" multiline rows={2} />
                  </Grid>
                </Grid>
              ) : (
                <Grid container spacing={2}>
                  {/* View Mode */}
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 600 }}>
                      User Details
                    </Typography>
                  </Grid>
                  <InfoRow label="Subscriber Name" value={enrollment.subscriber_name} />
                  <InfoRow label="EmployeeID" value={enrollment.employee_id} />
                  <InfoRow label="Contact No." value={enrollment.phone_number} />
                  <InfoRow label="Email" value={enrollment.email} />
                  <InfoRow label="Name" value={enrollment.name} />
                  <InfoRow label="UHID" value={enrollment.uhid} />
                  <InfoRow label="Date of Birth" value={enrollment.dob ? format(parseISO(enrollment.dob), 'dd/MM/yyyy') : null} />
                  <InfoRow label="Address" value={enrollment.address} />

                  <Grid item xs={12}>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 600 }}>
                      Billing & HCLH Details
                    </Typography>
                  </Grid>
                  <InfoRow label="Billed Date" value={enrollment.billed_date ? format(parseISO(enrollment.billed_date), 'dd/MM/yyyy') : null} />
                  <InfoRow label="Package Billed" value={enrollment.package_billed} />
                  <InfoRow label="HCLHC SPOC" value={enrollment.hclhc_spoc} />
                  <InfoRow label="HCL Facility" value={enrollment.hcl_facility} />
                  <InfoRow label="Doctor Name" value={enrollment.doctor_name} />

                  <Grid item xs={12}>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 600 }}>
                      Service Details
                    </Typography>
                  </Grid>
                  <InfoRow label="Trimester" value={enrollment.trimester} />
                  <InfoRow label="Service Enrolled" value={enrollment.service_enrolled} />
                  <InfoRow label="Package Name Enrolled" value={enrollment.package_name_enrolled} />
                  <InfoRow label="Service Partner" value={enrollment.service_partner} />
                  <InfoRow label="Partner Centre Selected" value={enrollment.partner_centre_selected} />
                  <InfoRow label="Partner Gynaecologist" value={enrollment.partner_gynaecologist} />

                  <Grid item xs={12}>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 600 }}>
                      Status & Follow-up
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary">Connect Status</Typography>
                    {enrollment.connect_status ? (
                      <Chip label={enrollment.connect_status} size="small" color="primary" sx={{ ml: 1 }} />
                    ) : (
                      <Typography variant="body2">-</Typography>
                    )}
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary">Action Taken</Typography>
                    {enrollment.action_taken ? (
                      <Chip label={enrollment.action_taken} size="small" variant="outlined" sx={{ ml: 1 }} />
                    ) : (
                      <Typography variant="body2">-</Typography>
                    )}
                  </Grid>
                  <InfoRow label="Follow Up Date" value={enrollment.follow_up_date ? format(parseISO(enrollment.follow_up_date), 'dd/MM/yyyy') : null} />
                  <InfoRow label="Next Follow Up Date" value={enrollment.next_follow_up_date ? format(parseISO(enrollment.next_follow_up_date), 'dd/MM/yyyy') : null} />
                  <InfoRow label="Customer Feedback" value={enrollment.customer_feedback} />
                  <InfoRow label="Remarks" value={enrollment.remarks} />

                  {enrollment.linked_lead_id && (
                    <>
                      <Grid item xs={12}>
                        <Divider sx={{ my: 1 }} />
                      </Grid>
                      <InfoRow label="Linked Lead ID" value={enrollment.linked_lead_id} />
                    </>
                  )}

                  <Grid item xs={12}>
                    <Divider sx={{ my: 1 }} />
                  </Grid>
                  <InfoRow label="Created At" value={formatDateTimeIST(enrollment.created_at)} />
                  <InfoRow label="Created By" value={enrollment.created_by_name} />
                  <InfoRow label="Updated At" value={formatDateTimeIST(enrollment.updated_at)} />
                </Grid>
              )}
            </TabPanel>

            <TabPanel value={tabValue} index={1}>
              {/* Follow-ups Tab */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="subtitle2">Follow-up History</Typography>
                {canEdit && (
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => setShowAddFollowUp(!showAddFollowUp)}
                  >
                    Add Follow-up
                  </Button>
                )}
              </Box>

              {showAddFollowUp && (
                <Paper sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        select
                        size="small"
                        label="Connect Status"
                        value={newFollowUp.connect_status}
                        onChange={(e) => setNewFollowUp({ ...newFollowUp, connect_status: e.target.value })}
                      >
                        <MenuItem value="">None</MenuItem>
                        {CONNECT_STATUS_OPTIONS.map((s) => (
                          <MenuItem key={s} value={s}>{s}</MenuItem>
                        ))}
                      </TextField>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        select
                        size="small"
                        label="Action Taken"
                        value={newFollowUp.action_taken}
                        onChange={(e) => setNewFollowUp({ ...newFollowUp, action_taken: e.target.value })}
                      >
                        <MenuItem value="">None</MenuItem>
                        {ACTION_TAKEN_OPTIONS.map((a) => (
                          <MenuItem key={a} value={a}>{a}</MenuItem>
                        ))}
                      </TextField>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <DatePicker
                        label="Next Follow Up Date"
                        value={newFollowUp.follow_up_date}
                        onChange={(d) => setNewFollowUp({ ...newFollowUp, follow_up_date: d })}
                        slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Feedback"
                        value={newFollowUp.feedback}
                        onChange={(e) => setNewFollowUp({ ...newFollowUp, feedback: e.target.value })}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Remarks"
                        value={newFollowUp.remarks}
                        onChange={(e) => setNewFollowUp({ ...newFollowUp, remarks: e.target.value })}
                        multiline
                        rows={2}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                        <Button size="small" onClick={() => setShowAddFollowUp(false)}>Cancel</Button>
                        <Button size="small" variant="contained" onClick={handleAddFollowUp} disabled={saving}>
                          {saving ? <CircularProgress size={20} /> : 'Save'}
                        </Button>
                      </Box>
                    </Grid>
                  </Grid>
                </Paper>
              )}

              {enrollment.follow_ups && enrollment.follow_ups.length > 0 ? (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>#</TableCell>
                        <TableCell>Date</TableCell>
                        <TableCell>Connect Status</TableCell>
                        <TableCell>Action Taken</TableCell>
                        <TableCell>Feedback</TableCell>
                        <TableCell>By</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {enrollment.follow_ups.map((fu: FollowUpEntry, index: number) => (
                        <TableRow key={index}>
                          <TableCell>{fu.follow_up_number}</TableCell>
                          <TableCell>
                            {fu.created_at ? formatShortDateIST(fu.created_at) : '-'}
                          </TableCell>
                          <TableCell>
                            {fu.connect_status ? (
                              <Chip label={fu.connect_status} size="small" color="primary" />
                            ) : '-'}
                          </TableCell>
                          <TableCell>
                            {fu.action_taken ? (
                              <Chip label={fu.action_taken} size="small" variant="outlined" />
                            ) : '-'}
                          </TableCell>
                          <TableCell sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {fu.feedback || fu.remarks || '-'}
                          </TableCell>
                          <TableCell>{fu.created_by_name || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  No follow-ups recorded yet
                </Typography>
              )}
            </TabPanel>
          </DialogContent>

          <Divider />

          <DialogActions sx={{ px: 3, py: 2 }}>
            {editMode ? (
              <>
                <Button onClick={() => setEditMode(false)}>Cancel</Button>
                <Button type="submit" variant="contained" disabled={saving}>
                  {saving ? <CircularProgress size={24} /> : 'Save Changes'}
                </Button>
              </>
            ) : (
              <Button onClick={handleClose}>Close</Button>
            )}
          </DialogActions>
        </form>
      </Dialog>
    </LocalizationProvider>
  );
}
