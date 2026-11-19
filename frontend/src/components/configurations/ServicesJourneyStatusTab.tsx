import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItemButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { clearDropdownCache } from '../../hooks/useDropdownOptions';

interface StatusItem {
  label: string;
  group: 'active' | 'converts' | 'closed';
  needs_note: boolean;
  in_use?: number;
  was?: string; // label as saved, to carry renames to customers
}

interface ServiceRow {
  service: string;
  leads: number;
  enrollments: number;
  items: StatusItem[];
}

const GROUP_LABELS: Record<StatusItem['group'], string> = {
  active: 'Active',
  converts: 'Converts to Antenatal lead',
  closed: 'Closed (stops the journey)',
};

const errDetail = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;

/** Super Admin: the shared Services list (leads and enrollments) and each
 *  service's Journey Status list. */
export default function ServicesJourneyStatusTab() {
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [locked, setLocked] = useState<string[]>([]);
  const [builtIn, setBuiltIn] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [draft, setDraft] = useState<StatusItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newService, setNewService] = useState('');
  const [renaming, setRenaming] = useState<{ old: string; value: string } | null>(null);

  const load = useCallback(async (keep?: string) => {
    setLoading(true);
    try {
      const { data } = await api.get('/enrollments/journey-state/config');
      setRows(data.services);
      setLocked(data.locked || []);
      setBuiltIn(data.built_in || []);
      const pick = (keep && data.services.find((r: ServiceRow) => r.service === keep)) || data.services[0];
      if (pick) {
        setSelected(pick.service);
        setDraft(pick.items.map((i: StatusItem) => ({ ...i, was: i.label })));
      }
      setDirty(false);
    } catch (e) {
      toast.error(errDetail(e, 'Failed to load the lists'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const choose = (svc: string) => {
    if (dirty && !window.confirm('Discard the unsaved changes to this list?')) return;
    const r = rows.find((x) => x.service === svc);
    setSelected(svc);
    setDraft((r?.items || []).map((i) => ({ ...i, was: i.label })));
    setDirty(false);
  };

  const run = async (fn: () => Promise<unknown>, ok: string, keep?: string) => {
    setBusy(true);
    try {
      await fn();
      clearDropdownCache();
      toast.success(ok);
      await load(keep);
    } catch (e) {
      toast.error(errDetail(e, 'Something went wrong'));
    } finally {
      setBusy(false);
    }
  };

  const setItem = (idx: number, patch: Partial<StatusItem>) => {
    setDraft((d) => d.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
    setDirty(true);
  };
  const move = (idx: number, dir: -1 | 1) => {
    setDraft((d) => {
      const n = [...d];
      const j = idx + dir;
      if (j < 0 || j >= n.length) return d;
      [n[idx], n[j]] = [n[j], n[idx]];
      return n;
    });
    setDirty(true);
  };
  const moveService = (idx: number, dir: -1 | 1) => {
    const list = rows.map((r) => r.service);
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j], list[idx]];
    run(() => api.put('/enrollments/journey-state/services/order', { services: list }), 'Order saved', selected);
  };

  const saveList = () =>
    run(
      () =>
        api.put(`/enrollments/journey-state/config/${encodeURIComponent(selected)}`, {
          items: draft.map(({ label, group, needs_note, was }) => ({ label, group, needs_note, was })),
        }).then(({ data }) => {
          if (data.customers_updated) toast.info(`${data.customers_updated} customer(s) moved to the renamed status`);
        }),
      `Journey Status list for ${selected} saved`,
      selected,
    );

  const current = rows.find((r) => r.service === selected);

  if (loading && !rows.length) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ px: 3, pb: 3 }}>
      <Typography variant="h6" sx={{ fontWeight: 600 }}>
        Services &amp; Journey Status
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        One Services list is used for leads (Service Requested) and enrollments (Service Enrolled). Each service has
        its own Journey Status list, shown in the enrollment header.
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '320px 1fr' }, gap: 2.5 }}>
        {/* Services */}
        <Paper variant="outlined" sx={{ p: 1.5, alignSelf: 'start' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Services
          </Typography>
          <List dense disablePadding>
            {rows.map((r, idx) => (
              <ListItemButton
                key={r.service}
                selected={r.service === selected}
                onClick={() => choose(r.service)}
                sx={{ borderRadius: 1.5, mb: 0.5, alignItems: 'flex-start', pr: 0.5 }}
              >
                {renaming?.old === r.service ? (
                  <Stack direction="row" spacing={0.5} sx={{ flex: 1 }} onClick={(e) => e.stopPropagation()}>
                    <TextField
                      size="small"
                      autoFocus
                      value={renaming.value}
                      onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                      sx={{ flex: 1 }}
                    />
                    <Button
                      size="small"
                      disabled={busy || !renaming.value.trim()}
                      onClick={() =>
                        run(
                          () =>
                            api.put('/enrollments/journey-state/services/rename', { old: r.service, new: renaming.value }).then(() =>
                              setRenaming(null),
                            ),
                          'Service renamed everywhere',
                          renaming.value.trim(),
                        )
                      }
                    >
                      Save
                    </Button>
                  </Stack>
                ) : (
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {r.service}
                      {builtIn.includes(r.service) && (
                        <Chip label="Built-in" size="small" sx={{ ml: 0.75, height: 18, fontSize: '0.65rem' }} />
                      )}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {r.leads} leads · {r.enrollments} enrollments
                    </Typography>
                  </Box>
                )}
                {renaming?.old !== r.service && (
                  <Stack direction="row" onClick={(e) => e.stopPropagation()}>
                    <IconButton size="small" disabled={busy || idx === 0} onClick={() => moveService(idx, -1)}>
                      <ArrowUpwardIcon fontSize="inherit" />
                    </IconButton>
                    <IconButton size="small" disabled={busy || idx === rows.length - 1} onClick={() => moveService(idx, 1)}>
                      <ArrowDownwardIcon fontSize="inherit" />
                    </IconButton>
                    {!builtIn.includes(r.service) && (
                      <>
                        <Tooltip title="Rename (updates every lead, enrollment and journey using it)">
                          <IconButton size="small" disabled={busy} onClick={() => setRenaming({ old: r.service, value: r.service })}>
                            <EditIcon fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={r.leads || r.enrollments ? 'In use, so it can’t be removed' : 'Remove'}>
                          <span>
                            <IconButton
                              size="small"
                              disabled={busy || !!(r.leads || r.enrollments)}
                              onClick={() =>
                                window.confirm(`Remove the service "${r.service}"?`) &&
                                run(() => api.delete(`/enrollments/journey-state/services/${encodeURIComponent(r.service)}`), 'Service removed')
                              }
                            >
                              <DeleteOutlineIcon fontSize="inherit" color={r.leads || r.enrollments ? 'disabled' : 'error'} />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </>
                    )}
                  </Stack>
                )}
              </ListItemButton>
            ))}
          </List>
          <Divider sx={{ my: 1 }} />
          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              placeholder="New service name"
              value={newService}
              onChange={(e) => setNewService(e.target.value)}
              sx={{ flex: 1 }}
            />
            <Button
              size="small"
              variant="contained"
              startIcon={<AddIcon />}
              disabled={busy || !newService.trim()}
              onClick={() =>
                run(
                  () => api.post('/enrollments/journey-state/services', { name: newService }).then(() => setNewService('')),
                  'Service added. Set up its care journey in the Care Journeys tab.',
                  newService.trim(),
                )
              }
            >
              Add
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
            Built-in services can't be renamed or removed: trimester scheduling and the Antenatal conversion depend on
            their names. A new service starts with a basic status list and needs a care journey set up in Care
            Journeys.
          </Typography>
        </Paper>

        {/* Journey Status list */}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap spacing={1}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Journey Status · {selected}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() => {
                  setDraft((d) => [...d, { label: '', group: 'active', needs_note: false }]);
                  setDirty(true);
                }}
              >
                Add status
              </Button>
              <Button size="small" disabled={!dirty || busy} onClick={() => choose(selected)}>
                Undo changes
              </Button>
              <Button size="small" variant="contained" startIcon={<SaveIcon />} disabled={!dirty || busy} onClick={saveList}>
                Save list
              </Button>
            </Stack>
          </Stack>

          <Alert severity="info" sx={{ mb: 1.5 }}>
            <b>Closed</b> statuses stop the care journey and grey the customer out. <b>Converts</b> statuses let the SPOC
            create an Antenatal lead. Renaming a status moves its customers to the new name. A status in use can't be
            removed or moved to another group. The first Active status is the default for new customers.
          </Alert>

          <Stack spacing={1}>
            {draft.map((it, idx) => {
              const isLocked = locked.includes(it.was || '') || locked.includes(it.label);
              return (
                <Paper key={idx} variant="outlined" sx={{ p: 1, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Stack>
                    <IconButton size="small" disabled={idx === 0} onClick={() => move(idx, -1)}>
                      <ArrowUpwardIcon fontSize="inherit" />
                    </IconButton>
                    <IconButton size="small" disabled={idx === draft.length - 1} onClick={() => move(idx, 1)}>
                      <ArrowDownwardIcon fontSize="inherit" />
                    </IconButton>
                  </Stack>
                  <TextField
                    size="small"
                    label="Status"
                    value={it.label}
                    onChange={(e) => setItem(idx, { label: e.target.value })}
                    disabled={isLocked}
                    sx={{ flex: 1, minWidth: 220 }}
                    helperText={it.was && it.was !== it.label.trim() ? `Renamed from "${it.was}"` : undefined}
                  />
                  <TextField
                    select
                    size="small"
                    label="Group"
                    value={it.group}
                    onChange={(e) => setItem(idx, { group: e.target.value as StatusItem['group'] })}
                    disabled={isLocked || !!it.in_use}
                    sx={{ width: 230 }}
                  >
                    {(Object.keys(GROUP_LABELS) as StatusItem['group'][]).map((g) => (
                      <MenuItem key={g} value={g}>
                        {GROUP_LABELS[g]}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Stack direction="row" alignItems="center">
                    <Checkbox
                      size="small"
                      checked={it.needs_note}
                      onChange={(e) => setItem(idx, { needs_note: e.target.checked })}
                      disabled={isLocked}
                    />
                    <Typography variant="caption">Ask for a description</Typography>
                  </Stack>
                  <Chip
                    size="small"
                    label={it.in_use ? `${it.in_use} customer${it.in_use === 1 ? '' : 's'}` : 'Not used'}
                    color={it.in_use ? 'primary' : 'default'}
                    variant="outlined"
                  />
                  <Tooltip title={isLocked ? 'Used by the system' : it.in_use ? 'In use: rename it instead' : 'Remove'}>
                    <span>
                      <IconButton
                        size="small"
                        disabled={isLocked || !!it.in_use}
                        onClick={() => {
                          setDraft((d) => d.filter((_, i) => i !== idx));
                          setDirty(true);
                        }}
                      >
                        <DeleteOutlineIcon fontSize="small" color={isLocked || it.in_use ? 'disabled' : 'error'} />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Paper>
              );
            })}
          </Stack>
          {current && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
              "Closed – Others" is used by the system (for example when a journey was stopped) and stays in every list.
            </Typography>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
