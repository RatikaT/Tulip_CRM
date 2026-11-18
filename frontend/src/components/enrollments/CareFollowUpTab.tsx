import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { startOfDay } from 'date-fns';
import { toast } from 'react-toastify';
import CareJourneyPanel from './CareJourneyPanel';
import { enrollmentService } from '../../services/enrollmentService';
import { journeyService } from '../../services/journeyService';
import { Enrollment, FollowUpEntry, JourneyStateOptions } from '../../types/enrollment.types';
import { JourneyStepInstance } from '../../types/journey.types';
import {
  formatFullDateTimeIST,
  formatShortDateIST,
  fromISTPickerToUTC,
  istDateKey,
  todayISTKey,
  toISTForPicker,
} from '../../utils/dateUtils';

interface Props {
  enrollment: Enrollment;
  options: JourneyStateOptions | null;
  canEdit: boolean;
  onChanged: () => void;
  /** The record-level Remarks / notes box, rendered by the page. */
  pinnedNotes: React.ReactNode;
}

const errDetail = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;

const CALL_BACK = 'Asked for call back';

export function callSummary(fu: FollowUpEntry): string {
  if (fu.call_status) {
    let what = fu.call_status === 'Connected' ? fu.outcome : fu.reason;
    if (what === 'Others' && fu.other_text) what = fu.other_text;
    return [fu.call_status, what].filter(Boolean).join(' · ');
  }
  return [fu.connect_status, fu.action_taken].filter(Boolean).join(' · ') || 'Follow-up';
}

type Kind = 'call' | 'step' | 'status';
interface TimelineItem {
  at: string;
  kind: Kind;
  title: string;
  sub: string;
}

const dotColor: Record<Kind, string> = { call: '#1e4088', step: '#137a4b', status: '#a15c00' };

function buildTimeline(e: Enrollment): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const fu of e.follow_ups || []) {
    const at = fu.created_at || fu.date;
    if (!at) continue;
    let title = callSummary(fu);
    if (fu.next_follow_up_date) {
      const lbl = fu.call_status === 'Not connected' ? 'try again' : fu.outcome === CALL_BACK ? 'call back' : 'next';
      title += ` · ${lbl} ${formatShortDateIST(fu.next_follow_up_date)}`;
    }
    if (fu.step_name) title += ` · step done: ${fu.step_name}`;
    const notes = [fu.feedback, fu.remarks].filter(Boolean).map((x) => `“${x}”`).join(' ');
    items.push({ at, kind: 'call', title, sub: [notes, fu.created_by_name].filter(Boolean).join(' · ') });
  }
  for (const s of (e.journey || []) as (JourneyStepInstance & { completed_via_call?: number; log?: { at: string; action: string; by_name?: string; to?: string }[] })[]) {
    if (s.status === 'done' && s.completed_date && !s.completed_via_call) {
      items.push({ at: s.completed_date, kind: 'step', title: `Step done · ${s.name}`, sub: s.completed_by_name || '' });
    }
    for (const l of s.log || []) {
      items.push({
        at: l.at,
        kind: 'step',
        title: l.action === 'skipped' ? `Step skipped · ${s.name}` : `Step rescheduled · ${s.name}${l.to ? ` → ${formatShortDateIST(l.to)}` : ''}`,
        sub: l.by_name || '',
      });
    }
  }
  for (const h of e.journey_state_history || []) {
    const label = h.note ? `${h.state}: ${h.note}` : h.state;
    const src = h.source === 'bulk' ? ' (bulk upload)' : '';
    items.push({
      at: h.at,
      kind: 'status',
      title: `Journey status → ${label}`,
      sub: [h.remarks ? `“${h.remarks}”` : '', `${h.by_name || 'System'}${src}`].filter(Boolean).join(' · '),
    });
  }
  if (e.paused_at) {
    items.push({ at: e.paused_at, kind: 'status', title: `Journey paused until ${formatShortDateIST(e.resume_on as string)}`, sub: [e.pause_reason, e.paused_by_name].filter(Boolean).join(' · ') });
  }
  if (e.journey_stopped_at && !e.journey_state_closed) {
    items.push({ at: e.journey_stopped_at, kind: 'status', title: `Journey stopped${e.journey_stopped_reason ? ` · ${e.journey_stopped_reason}` : ''}`, sub: e.journey_stopped_by_name || '' });
  }
  return items.sort((a, b) => (a.at < b.at ? 1 : -1));
}

export default function CareFollowUpTab({ enrollment, options, canEdit, onChanged, pinnedNotes }: Props) {
  const [callStatus, setCallStatus] = useState<'Connected' | 'Not connected'>('Connected');
  const [outcome, setOutcome] = useState('');
  const [reason, setReason] = useState('');
  const [otherText, setOtherText] = useState('');
  const [remarks, setRemarks] = useState('');
  const [nextDate, setNextDate] = useState<string | undefined>();
  const [stepId, setStepId] = useState('');
  const [saving, setSaving] = useState(false);
  const [stepBusy, setStepBusy] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);

  const pending = useMemo(
    () => [...(enrollment.journey || [])].filter((s) => s.status === 'pending').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [enrollment.journey],
  );
  const nextStep = pending[0];
  const nextOverdue = !!nextStep?.planned_date && (istDateKey(nextStep.planned_date) || '') < todayISTKey();
  const timeline = useMemo(() => buildTimeline(enrollment), [enrollment]);
  const locked = !!enrollment.call_locked;
  const connected = callStatus === 'Connected';
  const picked = connected ? outcome : reason;
  const dateRequired = !connected || outcome === CALL_BACK;
  const dateLabel = !connected ? 'Try again on *' : outcome === CALL_BACK ? 'Call-back date *' : 'Next follow-up';

  const reset = () => {
    setOutcome('');
    setReason('');
    setOtherText('');
    setRemarks('');
    setNextDate(undefined);
    setStepId('');
  };

  const saveCall = async () => {
    if (connected && !outcome) return toast.error('Choose the call outcome');
    if (picked === 'Others' && !otherText.trim()) return toast.error('Describe what happened');
    if (dateRequired && !nextDate) return toast.error(connected ? 'Choose the call-back date' : 'Choose when to try again');
    setSaving(true);
    try {
      await enrollmentService.logCall(enrollment.enrollment_id, {
        call_status: callStatus,
        outcome: connected ? outcome : undefined,
        reason: !connected ? reason || undefined : undefined,
        other_text: picked === 'Others' ? otherText.trim() : undefined,
        remarks: remarks.trim() || undefined,
        next_date: nextDate,
        step_id: stepId || undefined,
      });
      toast.success(stepId ? 'Call saved and care step marked done' : 'Call saved');
      reset();
      onChanged();
    } catch (e) {
      toast.error(errDetail(e, 'Failed to save the call'));
    } finally {
      setSaving(false);
    }
  };

  const stepAction = async (body: { status?: 'done' | 'skipped'; planned_date?: string }, ok: string) => {
    if (!nextStep) return;
    setStepBusy(true);
    try {
      await journeyService.updateStep(enrollment.enrollment_id, nextStep.step_id, body);
      toast.success(ok);
      setShowReschedule(false);
      onChanged();
    } catch (e) {
      toast.error(errDetail(e, 'Failed to update the step'));
    } finally {
      setStepBusy(false);
    }
  };

  return (
    <Stack spacing={2.5}>
      {/* Next up */}
      <Grid container spacing={1.5}>
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'grey.50', height: '100%' }}>
            <Typography variant="caption" color="text.secondary">Next care step</Typography>
            {nextStep ? (
              <>
                <Typography fontWeight={600}>{nextStep.name}</Typography>
                <Typography variant="body2" color={nextOverdue ? 'error.main' : 'text.secondary'}>
                  {nextStep.step_type || 'Step'} · planned {nextStep.planned_date ? formatShortDateIST(nextStep.planned_date) : '—'}
                  {nextOverdue ? ' · overdue' : ''}
                </Typography>
                {canEdit && !locked && enrollment.journey_status === 'active' && (
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                    <Button size="small" variant="contained" disabled={stepBusy} onClick={() => stepAction({ status: 'done' }, 'Step marked done')}>
                      ✓ Done
                    </Button>
                    <Button size="small" variant="outlined" disabled={stepBusy} onClick={() => setShowReschedule((v) => !v)}>
                      Reschedule
                    </Button>
                    <Button size="small" variant="outlined" disabled={stepBusy} onClick={() => stepAction({ status: 'skipped' }, 'Step skipped')}>
                      Skip
                    </Button>
                  </Stack>
                )}
                {showReschedule && (
                  <Box sx={{ mt: 1 }}>
                    <DatePicker
                      label="New date"
                      value={toISTForPicker(nextStep.planned_date)}
                      onAccept={(d) => {
                        const iso = fromISTPickerToUTC(d);
                        if (iso) stepAction({ planned_date: iso }, 'Step rescheduled');
                      }}
                      slotProps={{ textField: { size: 'small', sx: { width: 180 } } }}
                    />
                  </Box>
                )}
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {enrollment.journey?.length ? 'No pending steps' : 'No care journey yet'}
              </Typography>
            )}
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'grey.50', height: '100%' }}>
            <Typography variant="caption" color="text.secondary">Next follow-up</Typography>
            <Typography fontWeight={600}>
              {enrollment.next_follow_up_date ? formatFullDateTimeIST(enrollment.next_follow_up_date) : 'Not set'}
            </Typography>
            {!!enrollment.follow_ups?.length && (
              <Typography variant="body2" color="text.secondary">
                Last call: {callSummary(enrollment.follow_ups[enrollment.follow_ups.length - 1])}
              </Typography>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Log a call */}
      <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f8f9fa' }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
          Log a call
        </Typography>
        {locked ? (
          <Alert severity="info" sx={{ bgcolor: 'grey.100', color: 'text.secondary' }}>
            Calls can't be logged: this customer is{' '}
            {enrollment.do_not_contact ? 'marked Do Not Contact' : enrollment.journey_state_closed ? 'closed' : 'stopped'}.
            {enrollment.journey_state_closed && ' Reopen the Journey Status to log a call.'}
          </Alert>
        ) : !canEdit ? (
          <Typography variant="body2" color="text.secondary">
            Only the HCLH SPOC (Nurture Buddy) or an admin can log calls.
          </Typography>
        ) : (
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                select
                fullWidth
                size="small"
                label="Connect status"
                value={callStatus}
                onChange={(e) => {
                  setCallStatus(e.target.value as 'Connected' | 'Not connected');
                  setOtherText('');
                }}
              >
                <MenuItem value="Connected">Connected</MenuItem>
                <MenuItem value="Not connected">Not connected</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              {connected ? (
                <TextField select fullWidth size="small" label="Outcome *" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                  {(options?.call_outcomes || []).map((o) => (
                    <MenuItem key={o} value={o}>{o}</MenuItem>
                  ))}
                </TextField>
              ) : (
                <TextField select fullWidth size="small" label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)}>
                  <MenuItem value="">—</MenuItem>
                  {(options?.not_connected_reasons || []).map((o) => (
                    <MenuItem key={o} value={o}>{o}</MenuItem>
                  ))}
                </TextField>
              )}
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <DateTimePicker
                label={dateLabel}
                value={toISTForPicker(nextDate)}
                onChange={(date) => {
                  if (date && startOfDay(date) < startOfDay(new Date())) {
                    toast.error("The next date can't be in the past");
                    return;
                  }
                  setNextDate(fromISTPickerToUTC(date) || undefined);
                }}
                minDateTime={new Date()}
                slotProps={{ textField: { size: 'small', fullWidth: true } }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                select
                fullWidth
                size="small"
                label="Care step completed (optional)"
                value={stepId}
                onChange={(e) => setStepId(e.target.value)}
                disabled={!pending.length || enrollment.journey_status !== 'active'}
              >
                <MenuItem value="">None</MenuItem>
                {pending.map((s) => (
                  <MenuItem key={s.step_id} value={s.step_id}>
                    {s.name}{s.planned_date ? ` · ${formatShortDateIST(s.planned_date)}` : ''}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            {picked === 'Others' && (
              <Grid item xs={12}>
                <TextField fullWidth size="small" label="Describe what happened *" value={otherText} onChange={(e) => setOtherText(e.target.value)} />
              </Grid>
            )}
            <Grid item xs={12} md={9}>
              <TextField
                fullWidth
                size="small"
                label="Call remarks"
                placeholder="What was discussed?"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                multiline
                maxRows={4}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <Button variant="contained" fullWidth onClick={saveCall} disabled={saving} sx={{ height: 40 }}>
                {saving ? <CircularProgress size={18} /> : 'Save call'}
              </Button>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="caption" color="text.secondary">
                {stepId
                  ? 'Saving also marks this care step done: one action, one timeline entry.'
                  : 'A next date is required for "Asked for call back" and for "Not connected", so no customer is left without one.'}
              </Typography>
            </Grid>
          </Grid>
        )}
      </Paper>

      {/* Pinned notes */}
      <Box>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          Pinned note (saved with Save Changes)
        </Typography>
        {pinnedNotes}
      </Box>

      <Divider />

      {/* Checklist + timeline */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
            Care journey
          </Typography>
          <CareJourneyPanel enrollment={enrollment} canEdit={canEdit} onChanged={onChanged} />
        </Grid>
        <Grid item xs={12} md={6}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
            Timeline ({timeline.length})
          </Typography>
          {timeline.length === 0 ? (
            <Typography color="text.secondary" variant="body2">Nothing logged yet</Typography>
          ) : (
            <Stack spacing={0}>
              {timeline.map((t, i) => (
                <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '108px 14px minmax(0,1fr)', gap: 1.25, py: 0.75 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right', pt: 0.25 }}>
                    {formatFullDateTimeIST(t.at)}
                  </Typography>
                  <Box sx={{ position: 'relative' }}>
                    <Box sx={{ position: 'absolute', left: 2, top: 5, width: 10, height: 10, borderRadius: '50%', bgcolor: dotColor[t.kind] }} />
                    {i < timeline.length - 1 && (
                      <Box sx={{ position: 'absolute', left: 6, top: 15, bottom: -12, width: 2, bgcolor: 'divider' }} />
                    )}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} sx={{ wordBreak: 'break-word' }}>
                      {t.title}
                    </Typography>
                    {t.sub && (
                      <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                        {t.sub}
                      </Typography>
                    )}
                  </Box>
                </Box>
              ))}
            </Stack>
          )}
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Chip size="small" label="Call" sx={{ bgcolor: `${dotColor.call}1A`, color: dotColor.call }} />
            <Chip size="small" label="Care step" sx={{ bgcolor: `${dotColor.step}1A`, color: dotColor.step }} />
            <Chip size="small" label="Status" sx={{ bgcolor: `${dotColor.status}1A`, color: dotColor.status }} />
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  );
}
