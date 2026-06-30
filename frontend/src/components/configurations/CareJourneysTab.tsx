import { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Stack,
  Typography,
  Button,
  TextField,
  MenuItem,
  IconButton,
  Paper,
  Tabs,
  Tab,
  Tooltip,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
  FormControlLabel,
  Switch,
  Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import SaveIcon from '@mui/icons-material/Save';
import { toast } from 'react-toastify';
import { journeyService } from '../../services/journeyService';
import {
  JourneyStepDef,
  JourneyTemplate,
  CatalogueEntry,
  JOURNEY_SERVICES,
  STEP_TYPE_OPTIONS,
} from '../../types/journey.types';

type EditableStep = JourneyStepDef;
type Mode = 'care' | 'outreach';

// Build the API payload from editable steps, normalizing blanks to null.
function buildPayload(steps: EditableStep[]): JourneyStepDef[] {
  return steps.map((s, i) => ({
    step_id: s.step_id,
    name: s.name.trim(),
    description: s.description?.trim() || null,
    step_type: s.step_type || 'Other',
    offset_days: Number(s.offset_days) || 0,
    order: i,
    recurrence_days:
      s.recurrence_days === null || s.recurrence_days === undefined || Number.isNaN(Number(s.recurrence_days))
        ? null
        : Number(s.recurrence_days),
    recurrence_count:
      s.recurrence_count === null || s.recurrence_count === undefined || Number.isNaN(Number(s.recurrence_count))
        ? null
        : Number(s.recurrence_count),
    horizon: s.horizon ?? null,
    is_optional: !!s.is_optional,
  }));
}

function validateSteps(steps: EditableStep[]): string | null {
  for (const s of steps) {
    if (!s.name.trim()) return 'Every step needs a name';
    if (
      s.offset_days === null ||
      s.offset_days === undefined ||
      Number.isNaN(Number(s.offset_days)) ||
      Number(s.offset_days) < 0
    ) {
      return `"${s.name || 'A step'}" has an invalid day offset`;
    }
  }
  return null;
}

// ---- Reusable step-list editor (used by both Care and Outreach) ----
interface StepListEditorProps {
  steps: EditableStep[];
  emptyLabel: string;
  onUpdate: (idx: number, patch: Partial<EditableStep>) => void;
  onMove: (idx: number, dir: -1 | 1) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
}

function StepListEditor({ steps, emptyLabel, onUpdate, onMove, onAdd, onRemove }: StepListEditorProps) {
  return (
    <>
      <Stack spacing={1.25}>
        {steps.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            {emptyLabel}
          </Typography>
        )}

        {steps.map((step, idx) => (
          <Paper key={idx} variant="outlined" sx={{ p: 1.25 }}>
            {/* Line 1: core fields */}
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={1.25}
              alignItems={{ md: 'center' }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ width: 28, textAlign: 'center' }}>
                {idx + 1}
              </Typography>
              <TextField
                size="small"
                label="Step name"
                value={step.name}
                onChange={(e) => onUpdate(idx, { name: e.target.value })}
                sx={{ flex: 1, minWidth: 180 }}
              />
              <TextField
                size="small"
                select
                label="Type"
                value={step.step_type}
                onChange={(e) => onUpdate(idx, { step_type: e.target.value })}
                sx={{ width: 150 }}
              >
                {STEP_TYPE_OPTIONS.map((t) => (
                  <MenuItem key={t} value={t}>{t}</MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                type="number"
                label="Day (from enrollment)"
                value={step.offset_days}
                onChange={(e) => onUpdate(idx, { offset_days: e.target.value === '' ? 0 : Number(e.target.value) })}
                inputProps={{ min: 0 }}
                sx={{ width: 170 }}
              />
              <TextField
                size="small"
                label="Description (optional)"
                value={step.description || ''}
                onChange={(e) => onUpdate(idx, { description: e.target.value })}
                sx={{ flex: 1, minWidth: 160 }}
              />
              <Stack direction="row" spacing={0.25}>
                <Tooltip title="Move up"><span>
                  <IconButton size="small" onClick={() => onMove(idx, -1)} disabled={idx === 0}>
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                </span></Tooltip>
                <Tooltip title="Move down"><span>
                  <IconButton size="small" onClick={() => onMove(idx, 1)} disabled={idx === steps.length - 1}>
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                </span></Tooltip>
                <Tooltip title="Remove step"><span>
                  <IconButton size="small" color="error" onClick={() => onRemove(idx)}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </span></Tooltip>
              </Stack>
            </Stack>

            <Divider sx={{ my: 1 }} />

            {/* Line 2: recurrence fields (wrap so it never gets cramped) */}
            <Stack
              direction="row"
              spacing={1.25}
              alignItems="center"
              useFlexGap
              flexWrap="wrap"
              sx={{ pl: { md: '40px' } }}
            >
              <TextField
                size="small"
                type="number"
                label="Repeat every N days"
                value={step.recurrence_days ?? ''}
                onChange={(e) =>
                  onUpdate(idx, { recurrence_days: e.target.value === '' ? null : Number(e.target.value) })
                }
                inputProps={{ min: 1 }}
                sx={{ width: 180 }}
                helperText="Blank = one-off"
              />
              <TextField
                size="small"
                type="number"
                label="Repeat count"
                value={step.recurrence_count ?? ''}
                onChange={(e) =>
                  onUpdate(idx, { recurrence_count: e.target.value === '' ? null : Number(e.target.value) })
                }
                inputProps={{ min: 1 }}
                sx={{ width: 150 }}
                helperText="Blank = none"
              />
              <TextField
                size="small"
                select
                label="Horizon"
                value={step.horizon ?? ''}
                onChange={(e) =>
                  onUpdate(idx, { horizon: e.target.value === '' ? null : (e.target.value as 'trimester') })
                }
                sx={{ width: 210 }}
              >
                <MenuItem value="">—</MenuItem>
                <MenuItem value="trimester">Trimester (Antenatal)</MenuItem>
              </TextField>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={!!step.is_optional}
                    onChange={(e) => onUpdate(idx, { is_optional: e.target.checked })}
                  />
                }
                label="Optional"
              />
            </Stack>
          </Paper>
        ))}
      </Stack>

      <Stack direction="row" spacing={1.5} sx={{ mt: 2 }} alignItems="center">
        <Button startIcon={<AddIcon />} onClick={onAdd} variant="outlined" size="small">
          Add step
        </Button>
      </Stack>
    </>
  );
}

export default function CareJourneysTab() {
  const [mode, setMode] = useState<Mode>('care');

  // ---- Shared editor state ----
  const [steps, setSteps] = useState<EditableStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [updatedName, setUpdatedName] = useState<string | null | undefined>(undefined);

  // ---- Care state ----
  const [serviceIdx, setServiceIdx] = useState(0);
  const service = JOURNEY_SERVICES[serviceIdx];
  const [templates, setTemplates] = useState<Record<string, JourneyTemplate>>({});
  const [careLoading, setCareLoading] = useState(true);

  // ---- Outreach state ----
  const [outreachEntries, setOutreachEntries] = useState<CatalogueEntry[]>([]);
  const [outreachKey, setOutreachKey] = useState<string>('');
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [outreachStepLoading, setOutreachStepLoading] = useState(false);

  const setStepsFromTemplate = useCallback((t?: JourneyTemplate) => {
    const loaded = (t?.steps || [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((s) => ({ ...s }));
    setSteps(loaded);
    setUpdatedName(t?.updated_by_name);
  }, []);

  // ---- Care: load all templates ----
  const loadCare = useCallback(async () => {
    setCareLoading(true);
    try {
      const res = await journeyService.listTemplates();
      const map: Record<string, JourneyTemplate> = {};
      res.templates.forEach((t) => {
        const key = t.service || t.trigger_key;
        if (key) map[key] = t;
      });
      setTemplates(map);
    } catch {
      toast.error('Failed to load journey templates');
    } finally {
      setCareLoading(false);
    }
  }, []);

  useEffect(() => { loadCare(); }, [loadCare]);

  // Care: load the selected service's steps when service/templates change (care mode only)
  useEffect(() => {
    if (mode !== 'care') return;
    setStepsFromTemplate(templates[service]);
  }, [mode, service, templates, setStepsFromTemplate]);

  // ---- Outreach: load catalogue when entering outreach mode ----
  const loadOutreachCatalogue = useCallback(async () => {
    setOutreachLoading(true);
    try {
      const cat = await journeyService.catalogue();
      setOutreachEntries(cat.outreach || []);
    } catch {
      toast.error('Failed to load outreach catalogue');
    } finally {
      setOutreachLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'outreach' && outreachEntries.length === 0) {
      loadOutreachCatalogue();
    }
  }, [mode, outreachEntries.length, loadOutreachCatalogue]);

  // Outreach: load steps for the selected trigger
  const loadOutreachOne = useCallback(async (triggerKey: string) => {
    setOutreachStepLoading(true);
    try {
      const t = await journeyService.getOne('outreach', triggerKey);
      setStepsFromTemplate(t);
    } catch {
      toast.error('Failed to load outreach journey');
      setSteps([]);
      setUpdatedName(undefined);
    } finally {
      setOutreachStepLoading(false);
    }
  }, [setStepsFromTemplate]);

  const handleModeChange = (_: unknown, next: Mode | null) => {
    if (!next || next === mode) return;
    setMode(next);
    if (next === 'care') {
      setStepsFromTemplate(templates[service]);
    } else {
      // entering outreach: reset selection; catalogue load is handled by effect
      setOutreachKey('');
      setSteps([]);
      setUpdatedName(undefined);
    }
  };

  const handleOutreachSelect = (key: string) => {
    setOutreachKey(key);
    if (key) loadOutreachOne(key);
    else { setSteps([]); setUpdatedName(undefined); }
  };

  // ---- Shared editor mutators ----
  const updateStep = (idx: number, patch: Partial<EditableStep>) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const move = (idx: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      {
        name: '',
        description: '',
        step_type: 'Other',
        offset_days: 0,
        order: prev.length,
        recurrence_days: null,
        recurrence_count: null,
        horizon: null,
        is_optional: false,
      },
    ]);
  };

  const removeStep = (idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  };

  // ---- Save ----
  const handleSaveCare = async () => {
    const err = validateSteps(steps);
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      const saved = await journeyService.saveTemplate(service, buildPayload(steps));
      setTemplates((prev) => ({ ...prev, [service]: saved }));
      setUpdatedName(saved.updated_by_name);
      toast.success(`${service} journey saved`);
    } catch (e) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to save journey';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOutreach = async () => {
    if (!outreachKey) { toast.error('Select an outreach trigger first'); return; }
    const err = validateSteps(steps);
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      const saved = await journeyService.upsert('outreach', outreachKey, buildPayload(steps));
      setUpdatedName(saved.updated_by_name);
      toast.success('Outreach journey saved');
    } catch (e) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to save journey';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (mode === 'care' && careLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;
  }

  const outreachSelectedLabel = outreachEntries.find((e) => e.trigger_key === outreachKey)?.label;

  return (
    <Box>
      <ToggleButtonGroup
        value={mode}
        exclusive
        onChange={handleModeChange}
        size="small"
        sx={{ mb: 2 }}
      >
        <ToggleButton value="care">Care</ToggleButton>
        <ToggleButton value="outreach">Outreach</ToggleButton>
      </ToggleButtonGroup>

      {mode === 'care' ? (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Define the follow-up journey for each service. When a lead is enrolled, the matching journey is
            copied onto the enrollment as a checklist for the follow-up SPOC. Editing here affects only
            <strong> new</strong> enrollments — existing customers keep the journey they were given.
          </Typography>

          <Tabs
            value={serviceIdx}
            onChange={(_, v) => setServiceIdx(v)}
            sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            {JOURNEY_SERVICES.map((s) => (
              <Tab key={s} label={`${s} (${templates[s]?.steps?.length || 0})`} />
            ))}
          </Tabs>

          <StepListEditor
            steps={steps}
            emptyLabel={`No steps yet for ${service}. Add the first step below.`}
            onUpdate={updateStep}
            onMove={move}
            onAdd={addStep}
            onRemove={removeStep}
          />

          <Stack direction="row" spacing={1.5} sx={{ mt: 1.5 }} alignItems="center">
            <Button
              startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
              onClick={handleSaveCare}
              variant="contained"
              size="small"
              disabled={saving}
            >
              Save {service} journey
            </Button>
            {updatedName && (
              <Typography variant="caption" color="text.secondary">
                Last updated by {updatedName}
              </Typography>
            )}
          </Stack>
        </>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Define outreach journeys for each trigger (e.g. when a lead is marked Not Interested). The matching
            sequence is applied to the lead's outreach worklist. Editing here affects only
            <strong> new</strong> outreach journeys — leads already in an outreach sequence keep theirs.
          </Typography>

          {outreachLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : (
            <>
              <TextField
                select
                size="small"
                label="Outreach trigger"
                value={outreachKey}
                onChange={(e) => handleOutreachSelect(e.target.value)}
                sx={{ mb: 2, minWidth: 320 }}
              >
                <MenuItem value="">Select a trigger…</MenuItem>
                {outreachEntries.map((e) => (
                  <MenuItem key={e.trigger_key} value={e.trigger_key}>{e.label}</MenuItem>
                ))}
              </TextField>

              {!outreachKey ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                  Select an outreach trigger above to edit its journey.
                </Typography>
              ) : outreachStepLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
              ) : (
                <>
                  <StepListEditor
                    steps={steps}
                    emptyLabel={`No steps yet for "${outreachSelectedLabel || outreachKey}". Add the first step below.`}
                    onUpdate={updateStep}
                    onMove={move}
                    onAdd={addStep}
                    onRemove={removeStep}
                  />

                  <Stack direction="row" spacing={1.5} sx={{ mt: 1.5 }} alignItems="center">
                    <Button
                      startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
                      onClick={handleSaveOutreach}
                      variant="contained"
                      size="small"
                      disabled={saving}
                    >
                      Save outreach journey
                    </Button>
                    {updatedName && (
                      <Typography variant="caption" color="text.secondary">
                        Last updated by {updatedName}
                      </Typography>
                    )}
                  </Stack>
                </>
              )}
            </>
          )}
        </>
      )}
    </Box>
  );
}
