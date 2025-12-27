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
  Tabs,
  Tab,
  IconButton,
  Divider,
  Paper,
  CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import HistoryIcon from '@mui/icons-material/History';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { useAuthStore } from '../../stores/authStore';
import { leadService } from '../../services/leadService';
import { Lead, LeadSource, LEAD_STATUS_OPTIONS, LEAD_SOURCE_OPTIONS, STAGE_OPTIONS } from '../../types/lead.types';

interface LocalCallEntry {
  call_number: number;
  date_time: Date | null;
  summary: string;
}

interface LeadViewModalProps {
  open: boolean;
  lead: Lead;
  onClose: () => void;
  onUpdate: () => void;
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

export default function LeadViewModal({ open, lead, onClose, onUpdate }: LeadViewModalProps) {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [tabValue, setTabValue] = useState(0);
  const [saving, setSaving] = useState(false);
  const [auditTrail, setAuditTrail] = useState<unknown[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    // Core fields (admin can edit all, agent can edit limited)
    uhid: lead.uhid || '',
    employee_id: lead.employee_id || '',
    name: lead.name,
    email: lead.email || '',
    user_facility: lead.user_facility || '',
    phone_number: lead.phone_number,
    address: lead.address || '',
    pin_code: lead.pin_code || '',
    city: lead.city || '',
    stage: lead.stage || '',
    lead_source: lead.lead_source || '',
    doctor_name: lead.doctor_name || '',
    package_requested: lead.package_requested || '',
    status: lead.status,
    follow_up_date: lead.follow_up_date ? new Date(lead.follow_up_date) : null,
  });

  const [calls, setCalls] = useState<LocalCallEntry[]>(
    lead.calls && lead.calls.length > 0
      ? lead.calls.map((c, idx) => ({
          call_number: c.call_number || idx + 1,
          date_time: c.date_time ? new Date(c.date_time) : new Date(),
          summary: c.summary || '',
        }))
      : [{ call_number: 1, date_time: new Date(), summary: '' }]
  );

  useEffect(() => {
    if (open && isAdmin) {
      fetchAuditTrail();
    }
  }, [open, lead.id, isAdmin]);

  const fetchAuditTrail = async () => {
    setLoadingAudit(true);
    try {
      const response = await leadService.getAuditTrail(lead.id);
      setAuditTrail(response.audit_trail || []);
    } catch (error) {
      console.error('Failed to fetch audit trail:', error);
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleFieldChange = (field: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleCallChange = (index: number, field: string, value: unknown) => {
    setCalls((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addCall = () => {
    setCalls((prev: LocalCallEntry[]) => [
      ...prev,
      { call_number: prev.length + 1, date_time: new Date(), summary: '' },
    ]);
  };

  const removeCall = () => {
    if (calls.length > 1) {
      setCalls((prev) => prev.slice(0, -1));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updateData = {
        ...formData,
        lead_source: formData.lead_source ? (formData.lead_source as LeadSource) : undefined,
        follow_up_date: formData.follow_up_date instanceof Date ? formData.follow_up_date.toISOString() : null,
        number_of_calls: calls.length,
        calls: calls.map((c) => ({
          call_number: c.call_number,
          date_time: c.date_time instanceof Date ? c.date_time.toISOString() : new Date().toISOString(),
          summary: c.summary || '',
        })),
      };

      await leadService.updateLead(lead.id, updateData);
      toast.success('Lead updated successfully');
      onUpdate();
      onClose();
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to update lead';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Lead Details
              </Typography>
              <Typography variant="body2" color="primary" sx={{ fontWeight: 500 }}>
                {lead.lead_id}
              </Typography>
            </Box>
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        <Divider />

        {/* Header Info - Read Only */}
        <Box sx={{ px: 3, py: 2, backgroundColor: '#f5f5f5' }}>
          <Grid container spacing={2}>
            <Grid item xs={4}>
              <Typography variant="caption" color="text.secondary">
                Name
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {lead.name}
              </Typography>
            </Grid>
            <Grid item xs={4}>
              <Typography variant="caption" color="text.secondary">
                Status
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {formData.status}
              </Typography>
            </Grid>
            <Grid item xs={4}>
              <Typography variant="caption" color="text.secondary">
                Created
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {format(new Date(lead.created_at), 'dd/MM/yyyy hh:mm a')}
              </Typography>
            </Grid>
          </Grid>
        </Box>

        <DialogContent sx={{ pt: 2 }}>
          <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
            <Tab label="Details" />
            <Tab label="Calls" />
            {isAdmin && <Tab label="Audit Trail" icon={<HistoryIcon />} iconPosition="start" />}
          </Tabs>

          <TabPanel value={tabValue} index={0}>
            <Grid container spacing={2}>
              {/* Status - Everyone can edit */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  select
                  label="Status"
                  value={formData.status}
                  onChange={(e) => handleFieldChange('status', e.target.value)}
                >
                  {LEAD_STATUS_OPTIONS.map((status) => (
                    <MenuItem key={status} value={status}>
                      {status}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              {/* Follow Up Date - Everyone can edit */}
              <Grid item xs={12} sm={6}>
                <DatePicker
                  label="Follow Up Date"
                  value={formData.follow_up_date}
                  onChange={(date) => handleFieldChange('follow_up_date', date)}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </Grid>

              {/* Admin-only fields */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Phone Number"
                  value={formData.phone_number}
                  onChange={(e) => handleFieldChange('phone_number', e.target.value)}
                  disabled={!isAdmin}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Email"
                  value={formData.email}
                  onChange={(e) => handleFieldChange('email', e.target.value)}
                  disabled={!isAdmin}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  select
                  label="Lead Source"
                  value={formData.lead_source}
                  onChange={(e) => handleFieldChange('lead_source', e.target.value)}
                  disabled={!isAdmin}
                >
                  {LEAD_SOURCE_OPTIONS.map((source) => (
                    <MenuItem key={source} value={source}>
                      {source}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="City"
                  value={formData.city}
                  onChange={(e) => handleFieldChange('city', e.target.value)}
                  disabled={!isAdmin}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="User Facility"
                  value={formData.user_facility}
                  onChange={(e) => handleFieldChange('user_facility', e.target.value)}
                  disabled={!isAdmin}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Doctor Name"
                  value={formData.doctor_name}
                  onChange={(e) => handleFieldChange('doctor_name', e.target.value)}
                  disabled={!isAdmin}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  select
                  label="Stage"
                  value={formData.stage}
                  onChange={(e) => handleFieldChange('stage', e.target.value)}
                  disabled={!isAdmin}
                >
                  <MenuItem value="">None</MenuItem>
                  {STAGE_OPTIONS.map((s: string) => (
                    <MenuItem key={s} value={s}>
                      {s}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Package Requested"
                  value={formData.package_requested}
                  onChange={(e) => handleFieldChange('package_requested', e.target.value)}
                  disabled={!isAdmin}
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Address"
                  value={formData.address}
                  onChange={(e) => handleFieldChange('address', e.target.value)}
                  multiline
                  rows={2}
                  disabled={!isAdmin}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="PIN Code"
                  value={formData.pin_code}
                  onChange={(e) => handleFieldChange('pin_code', e.target.value)}
                  disabled={!isAdmin}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="UHID"
                  value={formData.uhid}
                  onChange={(e) => handleFieldChange('uhid', e.target.value)}
                  disabled={!isAdmin}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="Employee ID"
                  value={formData.employee_id}
                  onChange={(e) => handleFieldChange('employee_id', e.target.value)}
                  disabled={!isAdmin}
                />
              </Grid>
            </Grid>
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Call History ({calls.length})
              </Typography>
              <Box>
                <IconButton onClick={removeCall} disabled={calls.length <= 1} size="small">
                  <RemoveIcon />
                </IconButton>
                <IconButton onClick={addCall} color="primary" size="small">
                  <AddIcon />
                </IconButton>
              </Box>
            </Box>

            {calls.map((call, index) => (
              <Paper key={index} sx={{ p: 2, mb: 2, backgroundColor: '#fafafa' }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  Call {call.call_number}
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <DateTimePicker
                      label="Date & Time"
                      value={call.date_time}
                      onChange={(date) => handleCallChange(index, 'date_time', date)}
                      slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Summary"
                      value={call.summary}
                      onChange={(e) => handleCallChange(index, 'summary', e.target.value)}
                      multiline
                      rows={2}
                      size="small"
                    />
                  </Grid>
                </Grid>
              </Paper>
            ))}
          </TabPanel>

          {isAdmin && (
            <TabPanel value={tabValue} index={2}>
              {loadingAudit ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : auditTrail.length > 0 ? (
                <Box>
                  {auditTrail.map((entry: unknown, index: number) => {
                    const audit = entry as {
                      action: string;
                      user_name: string;
                      timestamp: string;
                      changes: Array<{ field: string; old_value: unknown; new_value: unknown }>;
                    };
                    return (
                      <Paper key={index} sx={{ p: 2, mb: 1, backgroundColor: '#fafafa' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                            {audit.action}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {format(new Date(audit.timestamp), 'dd/MM/yyyy hh:mm a')}
                          </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          by {audit.user_name}
                        </Typography>
                        {audit.changes && audit.changes.length > 0 && (
                          <Box sx={{ mt: 1 }}>
                            {audit.changes.map((change, cIdx) => (
                              <Typography key={cIdx} variant="caption" display="block">
                                <strong>{change.field}:</strong> {String(change.old_value)} → {String(change.new_value)}
                              </Typography>
                            ))}
                          </Box>
                        )}
                      </Paper>
                    );
                  })}
                </Box>
              ) : (
                <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  No audit history available
                </Typography>
              )}
            </TabPanel>
          )}
        </DialogContent>

        <Divider />

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? <CircularProgress size={24} /> : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>
    </LocalizationProvider>
  );
}
