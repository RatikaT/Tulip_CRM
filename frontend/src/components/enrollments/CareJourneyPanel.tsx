import { useEffect, useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  Chip,
  IconButton,
  Button,
  TextField,
  MenuItem,
  Tooltip,
  CircularProgress,
  Paper,
  Divider,
  Alert,
  Collapse,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import BlockIcon from '@mui/icons-material/Block';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import { toast } from 'react-toastify';
import { journeyService } from '../../services/journeyService';
import { JourneyStepInstance, JourneyStepStatus, STEP_TYPE_OPTIONS } from '../../types/journey.types';
import { Enrollment } from '../../types/enrollment.types';
import { formatShortDateIST, istDateKey, todayISTKey, toISTForPicker } from '../../utils/dateUtils';

interface CareJourneyPanelProps {
  enrollment: Enrollment;
  canEdit: boolean;
  onChanged?: () => void;
}

const typeColor: Record<string, string> = {
  Call: '#2563eb',
  Email: '#7c3aed',
  Appointment: '#0891b2',
  Lab: '#ca8a04',
  Other: '#64748b',
};

const softChipSx = (hex: string) => ({
  bgcolor: `${hex}1A`,
  color: hex,
  fontWeight: 600,
  border: `1px solid ${hex}33`,
});

function isOverdue(step: JourneyStepInstance): boolean {
  if (step.status !== 'pending' || !step.planned_date) return false;
  const planned = istDateKey(step.planned_date);
  return !!planned && planned < todayISTKey();
}

export default function CareJourneyPanel({ enrollment, canEdit, onChanged }: CareJourneyPanelProps) {
  const [journey, setJourney] = useState<JourneyStepInstance[]>(enrollment.journey || []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [instantiating, setInstantiating] = useState(false);

  // Add-step form
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<string>('Other');
  const [newDate, setNewDate] = useState<Date | null>(null);

  // Journey-level controls
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [showStop, setShowStop] = useState(false);
  const [stopReason, setStopReason] = useState('');
  const [showDnc, setShowDnc] = useState(false);
  const [dncReason, setDncReason] = useState('');

  useEffect(() => {
    setJourney(enrollment.journey || []);
  }, [enrollment]);

  const sorted = [...journey].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const doneCount = journey.filter((s) => s.status === 'done').length;

  const applyResult = (updated: Enrollment) => {
    setJourney(updated.journey || []);
    onChanged?.();
  };

  const handleInstantiate = async () => {
    setInstantiating(true);
    try {
      const updated = await journeyService.instantiate(enrollment.enrollment_id);
      applyResult(updated);
      toast.success('Care journey created from the template');
    } catch (e) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'No journey template found for this service';
      toast.error(msg);
    } finally {
      setInstantiating(false);
    }
  };

  const updateStep = async (
    step: JourneyStepInstance,
    body: { status?: JourneyStepStatus; planned_date?: string | null; notes?: string | null },
  ) => {
    setBusyId(step.step_id);
    try {
      const updated = await journeyService.updateStep(enrollment.enrollment_id, step.step_id, body);
      applyResult(updated);
    } catch (e) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to update step';
      toast.error(msg);
    } finally {
      setBusyId(null);
    }
  };

  const cycleStatus = (step: JourneyStepInstance) => {
    // pending -> done -> pending. (Skip has its own button.)
    const next: JourneyStepStatus = step.status === 'done' ? 'pending' : 'done';
    updateStep(step, { status: next });
  };

  const toggleSkip = (step: JourneyStepInstance) => {
    const next: JourneyStepStatus = step.status === 'skipped' ? 'pending' : 'skipped';
    updateStep(step, { status: next });
  };

  const handleReschedule = (step: JourneyStepInstance, d: Date | null) => {
    updateStep(step, { planned_date: d ? d.toISOString() : null });
  };

  const handleNotesBlur = (step: JourneyStepInstance, value: string) => {
    if ((step.notes || '') === value) return;
    updateStep(step, { notes: value });
  };

  const handleDelete = async (step: JourneyStepInstance) => {
    setBusyId(step.step_id);
    try {
      const updated = await journeyService.deleteStep(enrollment.enrollment_id, step.step_id);
      applyResult(updated);
    } catch {
      toast.error('Failed to remove step');
    } finally {
      setBusyId(null);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) {
      toast.error('Step name is required');
      return;
    }
    setBusyId('__new__');
    try {
      const updated = await journeyService.addStep(enrollment.enrollment_id, {
        name: newName.trim(),
        step_type: newType,
        planned_date: newDate ? newDate.toISOString() : null,
      });
      applyResult(updated);
      setNewName('');
      setNewType('Other');
      setNewDate(null);
      setShowAdd(false);
    } catch {
      toast.error('Failed to add step');
    } finally {
      setBusyId(null);
    }
  };

  const errDetail = (e: unknown, fallback: string) =>
    (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;

  const triggers = enrollment.journey_triggers || {};

  const handleStopJourney = async () => {
    setActionBusy('stop');
    try {
      const updated = await journeyService.stopEnrollmentJourney(enrollment.enrollment_id, stopReason.trim() || undefined);
      applyResult(updated);
      setShowStop(false);
      setStopReason('');
      toast.success('Journey stopped');
    } catch (e) {
      toast.error(errDetail(e, 'Failed to stop journey'));
    } finally {
      setActionBusy(null);
    }
  };

  const handleSetDnc = async (value: boolean) => {
    setActionBusy('dnc');
    try {
      const updated = await journeyService.setEnrollmentDnc(
        enrollment.enrollment_id,
        value,
        value ? dncReason.trim() || undefined : undefined,
      );
      applyResult(updated);
      setShowDnc(false);
      setDncReason('');
      toast.success(value ? 'Marked Do Not Contact' : 'Cleared Do Not Contact');
    } catch (e) {
      toast.error(errDetail(e, 'Failed to update Do Not Contact'));
    } finally {
      setActionBusy(null);
    }
  };

  const handleFlagContradiction = async () => {
    setActionBusy('flag');
    try {
      const updated = await journeyService.flagEnrollment(enrollment.enrollment_id, 'trimester_contradiction');
      applyResult(updated);
      toast.success('Flagged to Admin');
    } catch (e) {
      toast.error(errDetail(e, 'Failed to flag enrollment'));
    } finally {
      setActionBusy(null);
    }
  };

  const handleConvertToAntenatal = async () => {
    setActionBusy('convert');
    try {
      const res = await journeyService.convertToAntenatal(enrollment.enrollment_id);
      toast.success(res.message);
      onChanged?.();
    } catch (e) {
      toast.error(errDetail(e, 'Failed to convert to Antenatal'));
    } finally {
      setActionBusy(null);
    }
  };

  // Banners always render (even without a journey or canEdit).
  const banners = (
    <Stack spacing={1.25}>
      {triggers.needs_trimester && (
        <Alert severity="info">
          Add a trimester to start the Antenatal follow-up schedule.
        </Alert>
      )}
      {triggers.trimester_contradiction && (
        <Alert
          severity="warning"
          action={
            canEdit ? (
              enrollment.journey_flag ? (
                <Button color="inherit" size="small" disabled>
                  Flagged to Admin
                </Button>
              ) : (
                <Button
                  color="inherit"
                  size="small"
                  onClick={handleFlagContradiction}
                  disabled={actionBusy === 'flag'}
                >
                  {actionBusy === 'flag' ? <CircularProgress size={16} /> : 'Flag to Admin'}
                </Button>
              )
            ) : undefined
          }
        >
          Antenatal with 'Not Conceived' — correct the trimester, or flag to Admin.
        </Alert>
      )}
      {triggers.is_preconception && canEdit && (
        <Alert
          severity="success"
          action={
            enrollment.converted_to_lead_id ? (
              <Button color="inherit" size="small" disabled>
                Converted to lead {enrollment.converted_to_lead_id}
              </Button>
            ) : (
              <Button
                color="inherit"
                size="small"
                onClick={handleConvertToAntenatal}
                disabled={actionBusy === 'convert'}
              >
                {actionBusy === 'convert' ? <CircularProgress size={16} /> : 'Mark conceived → create Antenatal lead'}
              </Button>
            )
          }
        >
          Customer conceived?
        </Alert>
      )}

      {enrollment.journey_status === 'stopped' && (
        <Chip
          label={`Journey stopped — ${enrollment.journey_stopped_reason || 'stopped'}`}
          size="small"
          sx={{ alignSelf: 'flex-start', bgcolor: 'grey.200', color: 'text.secondary', fontWeight: 600 }}
        />
      )}
      {enrollment.do_not_contact && (
        <Chip
          label={`Do Not Contact${enrollment.dnc_reason ? ` — ${enrollment.dnc_reason}` : ''}`}
          size="small"
          color="error"
          sx={{ alignSelf: 'flex-start', fontWeight: 600 }}
        />
      )}
    </Stack>
  );

  // Journey-level action controls (canEdit only).
  const controls = canEdit && (
    <Box sx={{ mt: 1 }}>
      <Stack direction="row" spacing={1} flexWrap="wrap">
        {enrollment.journey_status !== 'stopped' && (
          <Button size="small" color="warning" variant="outlined" onClick={() => setShowStop((v) => !v)}>
            Stop journey
          </Button>
        )}
        {enrollment.do_not_contact ? (
          <Button
            size="small"
            color="inherit"
            variant="outlined"
            onClick={() => handleSetDnc(false)}
            disabled={actionBusy === 'dnc'}
          >
            {actionBusy === 'dnc' ? <CircularProgress size={16} /> : 'Clear DNC'}
          </Button>
        ) : (
          <Button size="small" color="error" variant="outlined" onClick={() => setShowDnc((v) => !v)}>
            Mark Do Not Contact
          </Button>
        )}
      </Stack>

      <Collapse in={showStop} unmountOnExit>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center" sx={{ mt: 1 }}>
          <TextField
            size="small"
            label="Reason (optional)"
            value={stopReason}
            onChange={(e) => setStopReason(e.target.value)}
            sx={{ flex: 1, minWidth: 180 }}
          />
          <Button
            size="small"
            color="warning"
            variant="contained"
            onClick={handleStopJourney}
            disabled={actionBusy === 'stop'}
          >
            {actionBusy === 'stop' ? <CircularProgress size={18} /> : 'Confirm stop'}
          </Button>
        </Stack>
      </Collapse>

      <Collapse in={showDnc} unmountOnExit>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center" sx={{ mt: 1 }}>
          <TextField
            size="small"
            label="Reason (optional)"
            value={dncReason}
            onChange={(e) => setDncReason(e.target.value)}
            sx={{ flex: 1, minWidth: 180 }}
          />
          <Button
            size="small"
            color="error"
            variant="contained"
            onClick={() => handleSetDnc(true)}
            disabled={actionBusy === 'dnc'}
          >
            {actionBusy === 'dnc' ? <CircularProgress size={18} /> : 'Confirm DNC'}
          </Button>
        </Stack>
      </Collapse>
    </Box>
  );

  if (journey.length === 0) {
    return (
      <Box>
        {banners}
        <Box sx={{ textAlign: 'center', py: 5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            No care journey on this enrollment yet.
          </Typography>
          {canEdit && (
            <Button variant="outlined" onClick={handleInstantiate} disabled={instantiating} startIcon={instantiating ? <CircularProgress size={16} /> : undefined}>
              Create from {enrollment.service_enrolled || 'service'} template
            </Button>
          )}
          {controls}
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      {banners}
      {(triggers.needs_trimester || triggers.trimester_contradiction || triggers.is_preconception ||
        enrollment.journey_status === 'stopped' || enrollment.do_not_contact) && <Box sx={{ mb: 1.5 }} />}

      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Typography variant="subtitle2" color="text.secondary">
          {doneCount}/{journey.length} steps done
          {enrollment.service_enrolled ? ` · ${enrollment.service_enrolled}` : ''}
        </Typography>
        {canEdit && (
          <Button size="small" startIcon={<AddIcon />} onClick={() => setShowAdd((v) => !v)}>
            Add step
          </Button>
        )}
      </Stack>

      {controls && <Box sx={{ mb: 1.5 }}>{controls}</Box>}

      {showAdd && canEdit && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, bgcolor: 'grey.50' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center">
            <TextField
              size="small"
              label="Step name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              sx={{ flex: 1, minWidth: 160 }}
            />
            <TextField
              size="small"
              select
              label="Type"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              sx={{ width: 140 }}
            >
              {STEP_TYPE_OPTIONS.map((t) => (
                <MenuItem key={t} value={t}>{t}</MenuItem>
              ))}
            </TextField>
            <DatePicker
              label="Planned date"
              value={newDate}
              onChange={setNewDate}
              slotProps={{ textField: { size: 'small', sx: { width: 170 } } }}
            />
            <Button variant="contained" size="small" onClick={handleAdd} disabled={busyId === '__new__'}>
              {busyId === '__new__' ? <CircularProgress size={18} /> : 'Add'}
            </Button>
          </Stack>
        </Paper>
      )}

      <Stack spacing={1}>
        {sorted.map((step) => {
          const overdue = isOverdue(step);
          const busy = busyId === step.step_id;
          const tcolor = typeColor[step.step_type || 'Other'] || typeColor.Other;
          return (
            <Paper
              key={step.step_id}
              variant="outlined"
              sx={{
                p: 1.25,
                borderColor: overdue ? 'error.light' : 'divider',
                bgcolor: step.status === 'done' ? 'success.50' : step.status === 'skipped' ? 'grey.100' : 'background.paper',
                opacity: step.status === 'skipped' ? 0.7 : 1,
              }}
            >
              <Stack direction="row" alignItems="flex-start" spacing={1}>
                {/* Status toggle */}
                <Tooltip title={canEdit ? (step.status === 'done' ? 'Mark not done' : 'Mark done') : ''}>
                  <span>
                    <IconButton size="small" onClick={() => cycleStatus(step)} disabled={!canEdit || busy} sx={{ mt: -0.25 }}>
                      {busy ? <CircularProgress size={18} /> : step.status === 'done'
                        ? <CheckCircleIcon fontSize="small" color="success" />
                        : <RadioButtonUncheckedIcon fontSize="small" color={overdue ? 'error' : 'action'} />}
                    </IconButton>
                  </span>
                </Tooltip>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 600, textDecoration: step.status === 'done' ? 'line-through' : 'none' }}
                    >
                      {step.name}
                    </Typography>
                    {step.step_type && (
                      <Chip label={step.step_type} size="small" sx={softChipSx(tcolor)} />
                    )}
                    {step.is_adhoc && <Chip label="Added" size="small" sx={softChipSx('#475569')} />}
                    {overdue && <Chip label="Overdue" size="small" sx={softChipSx('#dc2626')} />}
                    {step.status === 'skipped' && <Chip label="Skipped" size="small" sx={softChipSx('#64748b')} />}
                  </Stack>

                  {step.description && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      {step.description}
                    </Typography>
                  )}

                  <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 0.75 }} flexWrap="wrap">
                    {canEdit ? (
                      <DatePicker
                        label="Planned"
                        value={toISTForPicker(step.planned_date)}
                        onChange={(d) => handleReschedule(step, d)}
                        slotProps={{ textField: { size: 'small', sx: { width: 160 } } }}
                      />
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        Planned: {step.planned_date ? formatShortDateIST(step.planned_date) : '—'}
                      </Typography>
                    )}

                    {step.status === 'done' && step.completed_by_name && (
                      <Typography variant="caption" color="success.main">
                        Done by {step.completed_by_name}
                        {step.completed_date ? ` · ${formatShortDateIST(step.completed_date)}` : ''}
                      </Typography>
                    )}
                  </Stack>

                  {canEdit ? (
                    <TextField
                      size="small"
                      placeholder="Notes"
                      defaultValue={step.notes || ''}
                      onBlur={(e) => handleNotesBlur(step, e.target.value)}
                      fullWidth
                      sx={{ mt: 0.75 }}
                    />
                  ) : (
                    step.notes && (
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                        Notes: {step.notes}
                      </Typography>
                    )
                  )}
                </Box>

                {/* Right-side actions */}
                {canEdit && (
                  <Stack direction="row" spacing={0.25}>
                    <Tooltip title={step.status === 'skipped' ? 'Un-skip' : 'Skip step'}>
                      <span>
                        <IconButton size="small" onClick={() => toggleSkip(step)} disabled={busy}>
                          <BlockIcon fontSize="small" color={step.status === 'skipped' ? 'primary' : 'action'} />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Remove step">
                      <span>
                        <IconButton size="small" onClick={() => handleDelete(step)} disabled={busy}>
                          <DeleteOutlineIcon fontSize="small" color="error" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                )}
              </Stack>
            </Paper>
          );
        })}
      </Stack>

      {!canEdit && (
        <>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="caption" color="text.secondary">
            You are viewing this enrollment as the enroller — only the follow-up SPOC can update the journey.
          </Typography>
        </>
      )}
    </Box>
  );
}
