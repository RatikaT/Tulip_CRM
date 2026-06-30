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
  JOURNEY_SERVICES,
  STEP_TYPE_OPTIONS,
} from '../../types/journey.types';

type EditableStep = JourneyStepDef;

export default function CareJourneysTab() {
  const [serviceIdx, setServiceIdx] = useState(0);
  const service = JOURNEY_SERVICES[serviceIdx];

  const [templates, setTemplates] = useState<Record<string, JourneyTemplate>>({});
  const [steps, setSteps] = useState<EditableStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
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
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load the selected service's steps into the editor whenever service/templates change
  useEffect(() => {
    const t = templates[service];
    const loaded = (t?.steps || [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((s) => ({ ...s }));
    setSteps(loaded);
  }, [service, templates]);

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
      { name: '', description: '', step_type: 'Other', offset_days: prev.length ? 0 : 0, order: prev.length },
    ]);
  };

  const removeStep = (idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    // Validate
    for (const s of steps) {
      if (!s.name.trim()) {
        toast.error('Every step needs a name');
        return;
      }
      if (s.offset_days === null || s.offset_days === undefined || isNaN(Number(s.offset_days)) || Number(s.offset_days) < 0) {
        toast.error(`"${s.name || 'A step'}" has an invalid day offset`);
        return;
      }
    }
    setSaving(true);
    try {
      const payload: JourneyStepDef[] = steps.map((s, i) => ({
        step_id: s.step_id,
        name: s.name.trim(),
        description: s.description?.trim() || null,
        step_type: s.step_type || 'Other',
        offset_days: Number(s.offset_days) || 0,
        order: i,
      }));
      const saved = await journeyService.saveTemplate(service, payload);
      setTemplates((prev) => ({ ...prev, [service]: saved }));
      toast.success(`${service} journey saved`);
    } catch (e) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to save journey';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;
  }

  const updatedName = templates[service]?.updated_by_name;

  return (
    <Box>
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

      <Stack spacing={1.25}>
        {steps.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            No steps yet for {service}. Add the first step below.
          </Typography>
        )}

        {steps.map((step, idx) => (
          <Paper key={idx} variant="outlined" sx={{ p: 1.25 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} alignItems={{ md: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ width: 28, textAlign: 'center' }}>
                {idx + 1}
              </Typography>
              <TextField
                size="small"
                label="Step name"
                value={step.name}
                onChange={(e) => updateStep(idx, { name: e.target.value })}
                sx={{ flex: 1, minWidth: 180 }}
              />
              <TextField
                size="small"
                select
                label="Type"
                value={step.step_type}
                onChange={(e) => updateStep(idx, { step_type: e.target.value })}
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
                onChange={(e) => updateStep(idx, { offset_days: e.target.value === '' ? 0 : Number(e.target.value) })}
                inputProps={{ min: 0 }}
                sx={{ width: 170 }}
              />
              <TextField
                size="small"
                label="Description (optional)"
                value={step.description || ''}
                onChange={(e) => updateStep(idx, { description: e.target.value })}
                sx={{ flex: 1, minWidth: 160 }}
              />
              <Stack direction="row" spacing={0.25}>
                <Tooltip title="Move up"><span>
                  <IconButton size="small" onClick={() => move(idx, -1)} disabled={idx === 0}>
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                </span></Tooltip>
                <Tooltip title="Move down"><span>
                  <IconButton size="small" onClick={() => move(idx, 1)} disabled={idx === steps.length - 1}>
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                </span></Tooltip>
                <Tooltip title="Remove step"><span>
                  <IconButton size="small" color="error" onClick={() => removeStep(idx)}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </span></Tooltip>
              </Stack>
            </Stack>
          </Paper>
        ))}
      </Stack>

      <Stack direction="row" spacing={1.5} sx={{ mt: 2 }} alignItems="center">
        <Button startIcon={<AddIcon />} onClick={addStep} variant="outlined" size="small">
          Add step
        </Button>
        <Button
          startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
          onClick={handleSave}
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
    </Box>
  );
}
