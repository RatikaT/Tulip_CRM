import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Tabs,
  Tab,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Tooltip,
  IconButton,
  Checkbox,
  Collapse,
  LinearProgress,
  Badge,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CampaignIcon from '@mui/icons-material/Campaign';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { journeyService } from '../services/journeyService';
import { leadService } from '../services/leadService';
import { OutreachWorklistItem } from '../types/journey.types';
import { formatShortDateIST } from '../utils/dateUtils';
import { useAuthStore } from '../stores/authStore';
import { brandColors } from '../theme';

const CARD_SHADOW = '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)';

// Soft colored pill styles per lead status (matches DuplicatesPage / LeadsPage design)
const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  'Enquiry Lead': { bg: 'rgba(30,64,136,0.10)', color: '#1E4088' },
  'Enrolled': { bg: 'rgba(16,185,129,0.12)', color: '#0f8a63' },
  'Follow up-In Process': { bg: 'rgba(245,158,11,0.14)', color: '#b26a00' },
  'Follow up-No Response': { bg: 'rgba(255,152,0,0.14)', color: '#c2410c' },
  'Not Interested': { bg: 'rgba(239,68,68,0.12)', color: '#dc2626' },
  'Lead Closed-No Response': { bg: 'rgba(100,116,139,0.12)', color: '#475569' },
  'Duplicate': { bg: 'rgba(123,75,148,0.12)', color: '#7B4B94' },
};

const getStatusChipSx = (status: string) => {
  const s = STATUS_STYLES[status] || { bg: 'rgba(100,116,139,0.10)', color: '#475569' };
  return {
    bgcolor: s.bg,
    color: s.color,
    fontWeight: 600,
    fontSize: '0.7rem',
    height: 24,
    borderRadius: '8px',
    border: `1px solid ${s.color}33`,
    '& .MuiChip-label': { px: 1 },
  };
};

const channelChipSx = {
  bgcolor: 'rgba(30,64,136,0.08)',
  color: brandColors.navyBlue,
  fontWeight: 600,
  fontSize: '0.65rem',
  height: 20,
  borderRadius: '6px',
  '& .MuiChip-label': { px: 0.75 },
} as const;

const STEP_STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: 'rgba(245,158,11,0.14)', color: '#b26a00', label: 'Pending' },
  done: { bg: 'rgba(16,185,129,0.12)', color: '#0f8a63', label: 'Done' },
  skipped: { bg: 'rgba(100,116,139,0.12)', color: '#475569', label: 'Skipped' },
};

const getStepStatusChipSx = (status: string) => {
  const s = STEP_STATUS_STYLES[status] || STEP_STATUS_STYLES.pending;
  return {
    bgcolor: s.bg,
    color: s.color,
    fontWeight: 600,
    fontSize: '0.65rem',
    height: 20,
    borderRadius: '6px',
    border: `1px solid ${s.color}33`,
    '& .MuiChip-label': { px: 0.75 },
  };
};

// ---- Grouping ----
interface LeadGroup {
  lead_id: string;
  lead_name: string;
  status: string | null;
  service_requested: string | null;
  assigned_to_name: string | null;
  phone_number: string | null;
  steps: OutreachWorklistItem[];
  total: number;
  done: number;
  nextStep: OutreachWorklistItem | null;
}

type Bucket = 'overdue' | 'today' | 'upcoming' | 'other';

// Start of a given date (local) as epoch ms.
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

const bucketForNextStep = (nextStep: OutreachWorklistItem | null): Bucket => {
  if (!nextStep || !nextStep.planned_date) return 'other';
  const today = dayStart(new Date());
  const planned = dayStart(new Date(nextStep.planned_date));
  if (planned < today) return 'overdue';
  if (planned === today) return 'today';
  const in7 = today + 7 * 24 * 60 * 60 * 1000;
  if (planned > today && planned <= in7) return 'upcoming';
  return 'other';
};

const groupByLead = (items: OutreachWorklistItem[]): LeadGroup[] => {
  const map = new Map<string, LeadGroup>();
  for (const item of items) {
    let g = map.get(item.lead_id);
    if (!g) {
      g = {
        lead_id: item.lead_id,
        lead_name: item.lead_name || '—',
        status: item.status ?? null,
        service_requested: item.service_requested ?? null,
        assigned_to_name: item.assigned_to_name ?? null,
        phone_number: item.phone_number ?? null,
        steps: [],
        total: 0,
        done: 0,
        nextStep: null,
      };
      map.set(item.lead_id, g);
    }
    g.steps.push(item);
  }

  const groups = Array.from(map.values());
  for (const g of groups) {
    g.steps.sort((a, b) => {
      const oa = a.order ?? 0;
      const ob = b.order ?? 0;
      if (oa !== ob) return oa - ob;
      const pa = a.planned_date ? new Date(a.planned_date).getTime() : Number.MAX_SAFE_INTEGER;
      const pb = b.planned_date ? new Date(b.planned_date).getTime() : Number.MAX_SAFE_INTEGER;
      return pa - pb;
    });
    g.total = g.steps.length;
    g.done = g.steps.filter((s) => s.step_status === 'done').length;

    // next = earliest-planned pending step
    let next: OutreachWorklistItem | null = null;
    for (const s of g.steps) {
      if (s.step_status !== 'pending') continue;
      if (!next) {
        next = s;
        continue;
      }
      const sp = s.planned_date ? new Date(s.planned_date).getTime() : Number.MAX_SAFE_INTEGER;
      const np = next.planned_date ? new Date(next.planned_date).getTime() : Number.MAX_SAFE_INTEGER;
      if (sp < np) next = s;
    }
    g.nextStep = next;
  }

  // Sort leads: overdue-first-ish by nextStep planned date, then name.
  groups.sort((a, b) => {
    const ap = a.nextStep?.planned_date ? new Date(a.nextStep.planned_date).getTime() : Number.MAX_SAFE_INTEGER;
    const bp = b.nextStep?.planned_date ? new Date(b.nextStep.planned_date).getTime() : Number.MAX_SAFE_INTEGER;
    if (ap !== bp) return ap - bp;
    return a.lead_name.localeCompare(b.lead_name);
  });

  return groups;
};

type TabKey = 'overdue' | 'today' | 'upcoming' | 'all';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Due today' },
  { key: 'upcoming', label: 'Upcoming 7d' },
  { key: 'all', label: 'All' },
];

export default function OutreachWorklistPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isSuperAdmin = user?.role === 'super_admin';

  const [tab, setTab] = useState(0);
  const [items, setItems] = useState<OutreachWorklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [backfilling, setBackfilling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await journeyService.outreachWorklist();
      setItems(data.items || []);
    } catch (error) {
      console.error('Failed to load outreach worklist:', error);
      toast.error('Failed to load outreach worklist');
    } finally {
      setLoading(false);
    }
  }, []);

  // Super-admin one-click: build outreach journeys for existing closed leads
  // that don't have one (e.g. closed before the outreach feature existed).
  const handleBackfillOutreach = async () => {
    setBackfilling(true);
    try {
      const res = await leadService.backfillOutreach();
      toast.success(
        res.built > 0
          ? `Built outreach journeys for ${res.built} lead(s)`
          : 'All eligible closed leads already have an outreach journey'
      );
      await load();
    } catch (error) {
      console.error('Failed to backfill outreach:', error);
      const msg =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to backfill outreach journeys';
      toast.error(msg);
    } finally {
      setBackfilling(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    load();
  }, [isAdmin, load]);

  const groups = useMemo(() => groupByLead(items), [items]);

  const counts = useMemo(() => {
    const c = { overdue: 0, today: 0, upcoming: 0, all: groups.length };
    for (const g of groups) {
      const bucket = bucketForNextStep(g.nextStep);
      if (bucket === 'overdue') c.overdue += 1;
      else if (bucket === 'today') c.today += 1;
      else if (bucket === 'upcoming') c.upcoming += 1;
    }
    return c;
  }, [groups]);

  const activeKey = TABS[tab].key;

  const visibleGroups = useMemo(() => {
    if (activeKey === 'all') return groups;
    return groups.filter((g) => bucketForNextStep(g.nextStep) === activeKey);
  }, [groups, activeKey]);

  // Selection scoped to currently visible + actionable (has a next step) leads.
  const selectableIds = useMemo(
    () => visibleGroups.filter((g) => g.nextStep).map((g) => g.lead_id),
    [visibleGroups]
  );
  const selectedIds = useMemo(
    () => selectableIds.filter((id) => selected[id]),
    [selectableIds, selected]
  );
  const allSelected = selectableIds.length > 0 && selectedIds.length === selectableIds.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = { ...prev };
      if (allSelected) {
        for (const id of selectableIds) delete next[id];
      } else {
        for (const id of selectableIds) next[id] = true;
      }
      return next;
    });
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));

  const toggleExpand = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleUpdateStep = async (
    group: LeadGroup,
    step: OutreachWorklistItem,
    status: 'done' | 'skipped'
  ) => {
    setBusy((b) => ({ ...b, [group.lead_id]: true }));
    try {
      await journeyService.updateLeadStep(group.lead_id, step.step_id, { status });
      toast.success(status === 'done' ? 'Touchpoint marked done' : 'Touchpoint skipped');
      await load();
    } catch (error) {
      console.error('Failed to update touchpoint:', error);
      toast.error('Failed to update touchpoint');
    } finally {
      setBusy((b) => ({ ...b, [group.lead_id]: false }));
    }
  };

  const handleBulkDone = async () => {
    const targets = visibleGroups.filter((g) => selected[g.lead_id] && g.nextStep);
    if (targets.length === 0) return;
    setLoading(true);
    try {
      await Promise.all(
        targets.map((g) =>
          journeyService.updateLeadStep(g.lead_id, g.nextStep!.step_id, { status: 'done' })
        )
      );
      toast.success(`Marked ${targets.length} touchpoint${targets.length === 1 ? '' : 's'} done`);
      setSelected({});
      await load();
    } catch (error) {
      console.error('Failed bulk mark done:', error);
      toast.error('Failed to mark selected touchpoints done');
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <Box>
        <Card sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: CARD_SHADOW }}>
          <CardContent sx={{ py: 8, textAlign: 'center' }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
              Admins only
            </Typography>
            <Typography variant="body2" color="text.secondary">
              You don't have permission to view the outreach worklist.
            </Typography>
          </CardContent>
        </Card>
      </Box>
    );
  }

  const emptyCopy: Record<TabKey, { title: string; body: string }> = {
    overdue: { title: 'No overdue leads 🎉', body: 'Every lead’s next touchpoint is on track.' },
    today: { title: 'Nothing due today 🎉', body: 'No leads have a touchpoint planned for today.' },
    upcoming: { title: 'Nothing in the next 7 days', body: 'No upcoming touchpoints in the coming week.' },
    all: { title: 'No outreach journeys yet', body: 'Leads with an outreach sequence will appear here.' },
  };

  const renderEmpty = () => {
    const copy = emptyCopy[activeKey];
    return (
      <Card sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: CARD_SHADOW }}>
        <CardContent sx={{ py: 8, textAlign: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
            {copy.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {copy.body}
          </Typography>
        </CardContent>
      </Card>
    );
  };

  const renderNextTouchpoint = (group: LeadGroup) => {
    const next = group.nextStep;
    if (!next) {
      return (
        <Typography variant="body2" color="text.secondary">
          Done
        </Typography>
      );
    }
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {next.step_name || '—'}
          </Typography>
          {next.step_type && <Chip label={next.step_type} size="small" sx={channelChipSx} />}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: next.is_overdue ? 700 : 500,
              color: next.is_overdue ? 'error.main' : 'text.secondary',
            }}
          >
            {formatShortDateIST(next.planned_date)}
          </Typography>
          {next.is_overdue && (
            <Chip
              label="Overdue"
              size="small"
              color="error"
              sx={{ fontSize: '0.6rem', height: 18, fontWeight: 700, '& .MuiChip-label': { px: 0.6 } }}
            />
          )}
        </Box>
      </Box>
    );
  };

  const renderDetail = (group: LeadGroup) => (
    <Box sx={{ px: 2, py: 1.5, bgcolor: 'rgba(30,64,136,0.02)' }}>
      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
        Full sequence ({group.total} step{group.total === 1 ? '' : 's'})
      </Typography>
      <Table size="small" sx={{ mt: 1 }}>
        <TableBody>
          {group.steps.map((s) => (
            <TableRow key={s.step_id}>
              <TableCell sx={{ width: 40, color: 'text.secondary' }}>#{s.order ?? '—'}</TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {s.step_name || '—'}
                  </Typography>
                  {s.step_type && <Chip label={s.step_type} size="small" sx={channelChipSx} />}
                  {s.is_optional && (
                    <Chip
                      label="Optional"
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.6rem', height: 18, '& .MuiChip-label': { px: 0.6 } }}
                    />
                  )}
                </Box>
              </TableCell>
              <TableCell>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: s.is_overdue ? 700 : 400,
                    color: s.is_overdue ? 'error.main' : 'text.primary',
                  }}
                >
                  {formatShortDateIST(s.planned_date)}
                </Typography>
              </TableCell>
              <TableCell align="right">
                <Chip
                  label={STEP_STATUS_STYLES[s.step_status || 'pending']?.label || s.step_status}
                  size="small"
                  sx={getStepStatusChipSx(s.step_status || 'pending')}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );

  const renderTable = () => (
    <TableContainer
      component={Card}
      sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: CARD_SHADOW }}
    >
      <Table size="small">
        <TableHead>
          <TableRow sx={{ '& th': { fontWeight: 700, color: 'text.secondary', bgcolor: 'rgba(30,64,136,0.04)' } }}>
            <TableCell padding="checkbox">
              <Checkbox
                size="small"
                checked={allSelected}
                indeterminate={someSelected}
                onChange={toggleSelectAll}
                disabled={selectableIds.length === 0}
              />
            </TableCell>
            <TableCell sx={{ width: 40 }} />
            <TableCell>Lead</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Service</TableCell>
            <TableCell>Assigned agent</TableCell>
            <TableCell>Next touchpoint</TableCell>
            <TableCell>Progress</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {visibleGroups.map((group) => {
            const isBusy = !!busy[group.lead_id];
            const isOpen = !!expanded[group.lead_id];
            const next = group.nextStep;
            const pct = group.total > 0 ? (group.done / group.total) * 100 : 0;
            return (
              <Fragment key={group.lead_id}>
                <TableRow hover>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={!!selected[group.lead_id]}
                      onChange={() => toggleSelect(group.lead_id)}
                      disabled={!next}
                    />
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => toggleExpand(group.lead_id)}>
                      {isOpen ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
                    </IconButton>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {group.lead_name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {group.phone_number || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {group.status ? (
                      <Chip label={group.status} size="small" sx={getStatusChipSx(group.status)} />
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{group.service_requested || '—'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{group.assigned_to_name || '—'}</Typography>
                  </TableCell>
                  <TableCell>{renderNextTouchpoint(group)}</TableCell>
                  <TableCell>
                    <Box sx={{ minWidth: 90 }}>
                      <Typography variant="caption" color="text.secondary">
                        {group.done}/{group.total} done
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={pct}
                        sx={{
                          mt: 0.5,
                          height: 5,
                          borderRadius: 3,
                          bgcolor: 'rgba(30,64,136,0.08)',
                          '& .MuiLinearProgress-bar': { bgcolor: brandColors.navyBlue },
                        }}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.25 }}>
                      <Tooltip title={next ? 'Mark next done' : 'No pending step'}>
                        <span>
                          <IconButton
                            size="small"
                            color="success"
                            disabled={isBusy || !next}
                            onClick={() => next && handleUpdateStep(group, next, 'done')}
                          >
                            <CheckCircleIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title={next ? 'Skip next' : 'No pending step'}>
                        <span>
                          <IconButton
                            size="small"
                            color="warning"
                            disabled={isBusy || !next}
                            onClick={() => next && handleUpdateStep(group, next, 'skipped')}
                          >
                            <SkipNextIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Open lead">
                        <IconButton size="small" onClick={() => navigate(`/tulip/leads/${group.lead_id}`)}>
                          <OpenInNewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={9} sx={{ py: 0, border: 0 }}>
                    <Collapse in={isOpen} timeout="auto" unmountOnExit>
                      {renderDetail(group)}
                    </Collapse>
                  </TableCell>
                </TableRow>
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 1.5,
          mb: 2.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <CampaignIcon sx={{ color: brandColors.navyBlue }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Outreach
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {loading
                ? 'Loading touchpoints…'
                : `${groups.length} lead${groups.length === 1 ? '' : 's'} with an outreach journey`}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            startIcon={<DoneAllIcon />}
            onClick={handleBulkDone}
            disabled={loading || selectedIds.length === 0}
            sx={{ bgcolor: brandColors.navyBlue, '&:hover': { bgcolor: brandColors.navyBlue } }}
          >
            Mark selected done ({selectedIds.length})
          </Button>
          {isSuperAdmin && (
            <Tooltip title="Build outreach journeys for existing closed leads that don't have one yet">
              <span>
                <Button
                  variant="outlined"
                  onClick={handleBackfillOutreach}
                  disabled={backfilling || loading}
                >
                  {backfilling ? 'Building...' : 'Backfill Outreach'}
                </Button>
              </span>
            </Tooltip>
          )}
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => load()} disabled={loading}>
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', mb: 2.5 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            '& .MuiTab-root': { textTransform: 'none', fontWeight: 600 },
            '& .Mui-selected': { color: brandColors.navyBlue },
            '& .MuiTabs-indicator': { backgroundColor: brandColors.navyBlue },
          }}
        >
          {TABS.map((t) => {
            const count = t.key === 'all' ? counts.all : counts[t.key as Exclude<Bucket, 'other'>];
            return (
              <Tab
                key={t.key}
                label={
                  <Badge
                    color="primary"
                    badgeContent={count}
                    showZero
                    sx={{
                      '& .MuiBadge-badge': {
                        position: 'static',
                        transform: 'none',
                        ml: 1,
                        bgcolor: 'rgba(30,64,136,0.12)',
                        color: brandColors.navyBlue,
                        fontWeight: 700,
                      },
                    }}
                  >
                    {t.label}
                  </Badge>
                }
              />
            );
          })}
        </Tabs>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 }}>
          <CircularProgress />
        </Box>
      ) : visibleGroups.length === 0 ? (
        renderEmpty()
      ) : (
        renderTable()
      )}
    </Box>
  );
}
