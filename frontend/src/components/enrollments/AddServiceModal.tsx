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
  CircularProgress,
} from '@mui/material';
import { toast } from 'react-toastify';
import { useDropdownOptions } from '../../hooks/useDropdownOptions';
import { AddServiceRequest } from '../../types/enrollment.types';

interface AddServiceModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: AddServiceRequest) => Promise<void>;
  /** Current SPOC of the source enrollment, used to prefill (editable). */
  defaultSpoc?: string | null;
}

const EMPTY: AddServiceRequest = {
  billed_date: '',
  package_billed: '',
  service_enrolled: '',
  hclhc_spoc: '',
  trimester: '',
  package_name_enrolled: '',
  service_partner: '',
  partner_centre_selected: '',
  partner_gynaecologist: '',
};

export default function AddServiceModal({
  open,
  onClose,
  onSubmit,
  defaultSpoc,
}: AddServiceModalProps) {
  const [form, setForm] = useState<AddServiceRequest>(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  // Reuse the shared, admin-managed dropdowns.
  const { options: serviceOptions } = useDropdownOptions('service_enrolled');
  const { options: partnerOptions } = useDropdownOptions('service_partner');
  const { options: trimesterOptions } = useDropdownOptions('trimester');
  const { options: packageOptions } = useDropdownOptions('package_options');

  // Reset + prefill SPOC each time the modal opens.
  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, hclhc_spoc: defaultSpoc || '' });
    }
  }, [open, defaultSpoc]);

  const setField = (field: keyof AddServiceRequest, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    // Mandatory-field validation (mirrors Create Enrollment).
    if (!form.billed_date) return toast.error('Billed Date is required');
    if (!form.package_billed.trim()) return toast.error('Package Billed is required');
    if (!form.service_enrolled) return toast.error('Service Enrolled is required');
    if (!form.hclhc_spoc.trim()) return toast.error('HCLHC SPOC is required');

    setSubmitting(true);
    try {
      // Drop empty optionals so the backend keeps them null.
      const payload: AddServiceRequest = { ...form };
      (Object.keys(payload) as (keyof AddServiceRequest)[]).forEach((k) => {
        if (payload[k] === '') delete payload[k];
      });
      await onSubmit(payload);
      onClose();
    } catch {
      // onSubmit surfaces its own toast on failure.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Add Service</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2} sx={{ mt: 0 }}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label="Billed Date *"
              value={form.billed_date}
              onChange={(e) => setField('billed_date', e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              label="Package Billed *"
              value={form.package_billed}
              onChange={(e) => setField('package_billed', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              select
              label="Service Enrolled *"
              value={form.service_enrolled}
              onChange={(e) => setField('service_enrolled', e.target.value)}
            >
              <MenuItem value="">Select Service</MenuItem>
              {serviceOptions.map((o) => (
                <MenuItem key={o} value={o}>{o}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              label="HCLHC SPOC *"
              value={form.hclhc_spoc}
              onChange={(e) => setField('hclhc_spoc', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              select
              label="Trimester"
              value={form.trimester}
              onChange={(e) => setField('trimester', e.target.value)}
            >
              <MenuItem value="">Not specified</MenuItem>
              {trimesterOptions.map((o) => (
                <MenuItem key={o} value={o}>{o}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              select
              label="Package Name Enrolled"
              value={form.package_name_enrolled}
              onChange={(e) => setField('package_name_enrolled', e.target.value)}
            >
              <MenuItem value="">Select Package</MenuItem>
              {packageOptions.map((o) => (
                <MenuItem key={o} value={o}>{o}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              select
              label="Service Partner"
              value={form.service_partner}
              onChange={(e) => setField('service_partner', e.target.value)}
            >
              <MenuItem value="">Select Partner</MenuItem>
              {partnerOptions.map((o) => (
                <MenuItem key={o} value={o}>{o}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              label="Partner Centre"
              value={form.partner_centre_selected}
              onChange={(e) => setField('partner_centre_selected', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              label="Partner Gynaecologist"
              value={form.partner_gynaecologist}
              onChange={(e) => setField('partner_gynaecologist', e.target.value)}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={submitting} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={submitting}
          startIcon={submitting ? <CircularProgress size={16} /> : undefined}
        >
          {submitting ? 'Adding...' : 'Add Service'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
