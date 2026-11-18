import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  ListSubheader,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { toast } from 'react-toastify';
import { enrollmentService } from '../../services/enrollmentService';
import { Enrollment, JourneyStateOptions } from '../../types/enrollment.types';
import { formatShortDateIST } from '../../utils/dateUtils';

interface Props {
  enrollment: Enrollment;
  options: JourneyStateOptions | null;
  canEdit: boolean;
  onChanged: () => void;
}

const errDetail = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;

// The STATES key for this enrollment's service ("Tulip Antenatal" -> "Antenatal").
export function serviceKey(enrollment: Enrollment, options: JourneyStateOptions | null): string | null {
  const svc = (enrollment.journey_classification || enrollment.service_enrolled || '').toLowerCase().replace(/\s/g, '');
  return Object.keys(options?.states || {}).find((k) => svc.includes(k.toLowerCase())) || null;
}

/** Journey Status in the enrollment header: dropdown (grouped per service),
 *  "Others" description, and the Closed / Antenatal banners. */
export default function JourneyStatusControl({ enrollment, options, canEdit, onChanged }: Props) {
  const [pendingOthers, setPendingOthers] = useState<string | null>(null);
  const [othersText, setOthersText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const key = serviceKey(enrollment, options);
  const groups = key ? options!.states[key] : null;
  const current = enrollment.journey_state || '';
  const closed = !!enrollment.journey_state_closed;
  const interest = options?.antenatal_interest;

  const save = async (state: string, note?: string, createLead = false) => {
    setBusy(createLead ? 'lead' : 'save');
    try {
      const res = await enrollmentService.setJourneyState(enrollment.enrollment_id, {
        state,
        note,
        create_antenatal_lead: createLead,
      });
      setPendingOthers(null);
      setOthersText('');
      toast.success(
        res.lead_id
          ? `Status saved. Antenatal lead ${res.lead_id} created.`
          : res.enrollment.journey_state_closed && !closed
            ? 'Status saved. Care journey stopped.'
            : 'Status saved',
      );
      onChanged();
    } catch (e) {
      toast.error(errDetail(e, 'Failed to save the status'));
    } finally {
      setBusy(null);
    }
  };

  const onPick = (value: string) => {
    if (!value) return;
    if (value === current && !options?.needs_note.includes(value)) {
      // Back to the saved status: drop an unsaved "Others" choice.
      setPendingOthers(null);
      setOthersText('');
      return;
    }
    if (options?.needs_note.includes(value)) {
      setPendingOthers(value);
      setOthersText(value === current ? enrollment.journey_state_note || '' : '');
      return;
    }
    setPendingOthers(null);
    if (value === interest && !enrollment.converted_to_lead_id) {
      // On screen this also creates the Antenatal lead (bulk uploads never do).
      if (window.confirm('This also creates an Antenatal lead for this customer and stops the PreConception journey. Continue?')) {
        save(value, undefined, true);
      }
      return;
    }
    save(value);
  };

  if (!groups) {
    return (
      <Typography variant="body2" color="text.secondary">
        {enrollment.journey_state_label || 'Not set'}
      </Typography>
    );
  }

  return (
    <Box>
      {canEdit ? (
        <TextField
          select
          size="small"
          value={pendingOthers || current}
          onChange={(e) => onPick(e.target.value)}
          disabled={!!busy}
          sx={{ minWidth: 240, maxWidth: '100%' }}
          SelectProps={{
            renderValue: (v) => (v === current ? enrollment.journey_state_label || current : (v as string)) || 'Not set',
            displayEmpty: true,
          }}
        >
          {Object.entries(groups).flatMap(([g, items]) => [
            <ListSubheader key={`h-${g}`}>{g === 'Closed' ? 'Closed (stops the journey)' : g}</ListSubheader>,
            ...items.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            )),
          ])}
        </TextField>
      ) : (
        <Chip
          size="small"
          label={enrollment.journey_state_label || 'Not set'}
          sx={closed ? { bgcolor: 'grey.200', color: 'text.secondary', fontWeight: 600 } : { fontWeight: 600 }}
          color={closed ? 'default' : 'primary'}
          variant={closed ? 'filled' : 'outlined'}
        />
      )}
      {enrollment.journey_state_at && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
          {enrollment.journey_state_by_name ? `${enrollment.journey_state_by_name} · ` : ''}
          {formatShortDateIST(enrollment.journey_state_at)}
        </Typography>
      )}

      {pendingOthers && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} sx={{ mt: 1 }}>
          <TextField
            size="small"
            autoFocus
            label="Describe the status *"
            placeholder="e.g. Relocated abroad"
            value={othersText}
            onChange={(e) => setOthersText(e.target.value)}
            sx={{ minWidth: 220 }}
          />
          <Button
            size="small"
            variant="contained"
            disabled={!othersText.trim() || !!busy}
            onClick={() => save(pendingOthers, othersText.trim())}
          >
            {busy === 'save' ? <CircularProgress size={16} /> : 'Save status'}
          </Button>
          <Button size="small" onClick={() => setPendingOthers(null)}>
            Cancel
          </Button>
        </Stack>
      )}
    </Box>
  );
}

/** Full-width banners under the header: closed / converting to Antenatal. */
export function JourneyStatusBanner({ enrollment, options, canEdit, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const closed = !!enrollment.journey_state_closed;
  const key = serviceKey(enrollment, options);

  const run = async (fn: () => Promise<unknown>, ok: string, fail: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      onChanged();
    } catch (e) {
      toast.error(errDetail(e, fail));
    } finally {
      setBusy(false);
    }
  };

  if (closed) {
    const first = key ? Object.values(options!.states[key])[0]?.[0] : null;
    return (
      <Alert
        severity="info"
        icon={false}
        sx={{ mt: 2, bgcolor: 'grey.100', color: 'text.primary', border: 1, borderColor: 'divider' }}
        action={
          canEdit && first && !enrollment.do_not_contact ? (
            <Button
              color="inherit"
              size="small"
              disabled={busy}
              onClick={() =>
                run(
                  () => enrollmentService.setJourneyState(enrollment.enrollment_id, { state: first }),
                  `Journey reopened as "${first}"`,
                  'Failed to reopen',
                )
              }
            >
              {busy ? <CircularProgress size={16} /> : 'Reopen'}
            </Button>
          ) : undefined
        }
      >
        <b>Closed: {enrollment.journey_state_label}.</b> Care journey stopped. Greyed out in the Enrollments list
        and left out of Follow-ups Today, My Tasks and the Follow-up Sheet. Do not follow up.
      </Alert>
    );
  }

  if (enrollment.journey_state && enrollment.journey_state === options?.antenatal_interest) {
    return (
      <Alert
        severity="success"
        sx={{ mt: 2 }}
        action={
          enrollment.converted_to_lead_id ? (
            <Button color="inherit" size="small" component={RouterLink} to={`/tulip/leads/${enrollment.converted_to_lead_id}`}>
              Open lead {enrollment.converted_to_lead_id}
            </Button>
          ) : canEdit ? (
            <Button
              color="inherit"
              size="small"
              disabled={busy}
              onClick={() =>
                run(
                  () => enrollmentService.bulkCreateAntenatalLeads([enrollment.enrollment_id]).then((r) => {
                    if (r.failed.length) throw { response: { data: { detail: r.failed[0].error } } };
                  }),
                  'Antenatal lead created',
                  'Failed to create the Antenatal lead',
                )
              }
            >
              {busy ? <CircularProgress size={16} /> : 'Create Antenatal lead'}
            </Button>
          ) : undefined
        }
      >
        {enrollment.converted_to_lead_id ? (
          <>
            <b>Converted to Antenatal.</b> Lead {enrollment.converted_to_lead_id} was created and this PreConception
            journey is closed.
          </>
        ) : (
          <>
            <b>Interested in the Antenatal program.</b> Antenatal lead not created yet. Creating it copies the
            contact details, assigns it to the same SPOC and closes this PreConception journey.
          </>
        )}
      </Alert>
    );
  }
  return null;
}
