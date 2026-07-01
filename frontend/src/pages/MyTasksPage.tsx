import { useState, useEffect, useCallback, useMemo } from 'react';
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
  LinearProgress,
  Badge,
  TextField,
  Stack,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import RefreshIcon from '@mui/icons-material/Refresh';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SaveIcon from '@mui/icons-material/Save';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import TodayIcon from '@mui/icons-material/Today';
import EventIcon from '@mui/icons-material/Event';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { taskService } from '../services/taskService';
import { journeyService } from '../services/journeyService';
import { leadService } from '../services/leadService';
import { MyTask } from '../types/task.types';
import { formatShortDateIST } from '../utils/dateUtils';
import { useAuthStore } from '../stores/authStore';
import { brandColors } from '../theme';

const CARD_SHADOW = '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)';

const channelChipSx = {
  bgcolor: 'rgba(30,64,136,0.08)',
  color: brandColors.navyBlue,
  fontWeight: 600,
  fontSize: '0.65rem',
  height: 20,
  borderRadius: '6px',
  '& .MuiChip-label': { px: 0.75 },
} as const;

const typeChipSx = (type: MyTask['task_type']) => {
  const care = type === 'care_step';
  return {
    bgcolor: care ? 'rgba(123,75,148,0.12)' : 'rgba(30,64,136,0.10)',
    color: care ? '#7B4B94' : '#1E4088',
    fontWeight: 700,
    fontSize: '0.65rem',
    height: 22,
    borderRadius: '6px',
    border: `1px solid ${care ? '#7B4B9433' : '#1E408833'}`,
    '& .MuiChip-label': { px: 0.9 },
  } as const;
};

const statusChipSx = {
  bgcolor: 'rgba(100,116,139,0.10)',
  color: '#475569',
  fontWeight: 600,
  fontSize: '0.65rem',
  height: 20,
  borderRadius: '6px',
  '& .MuiChip-label': { px: 0.75 },
} as const;

// ---- Buckets ----
type Bucket = 'overdue' | 'today' | 'upcoming';
type TabKey = 'due_now' | 'overdue' | 'today' | 'upcoming' | 'all';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'due_now', label: 'Due now' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Due today' },
  { key: 'upcoming', label: 'Upcoming 7d' },
  { key: 'all', label: 'All' },
];

// Start of a given date (local) as epoch ms.
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

const bucketForTask = (task: MyTask): Bucket | 'other' => {
  if (task.is_overdue) return 'overdue';
  if (!task.due_date) return 'other';
  const today = dayStart(new Date());
  const due = dayStart(new Date(task.due_date));
  if (due === today) return 'today';
  const in7 = today + 7 * 24 * 60 * 60 * 1000;
  if (due > today && due <= in7) return 'upcoming';
  return 'other';
};

const matchesTab = (task: MyTask, key: TabKey): boolean => {
  if (key === 'all') return true;
  const b = bucketForTask(task);
  if (key === 'due_now') return b === 'overdue' || b === 'today';
  return b === key;
};

const rowKey = (t: MyTask) =>
  `${t.task_type}:${t.enrollment_id || t.lead_id || t.record_id}:${t.step_id || ''}`;

export default function MyTasksPage() {
  const navigate = useNavigate();
  // Page is available to all roles; useAuthStore kept for parity / future use.
  useAuthStore();

  const [tab, setTab] = useState(0);
  const [items, setItems] = useState<MyTask[]>([]);
  const [counts, setCounts] = useState({ overdue: 0, due_today: 0, upcoming: 0 });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await taskService.myTasks();
      setItems(data.items || []);
      setCounts(data.counts || { overdue: 0, due_today: 0, upcoming: 0 });
      setTotal(data.total ?? (data.items?.length || 0));
    } catch (error) {
      console.error('Failed to load my tasks:', error);
      toast.error('Failed to load your tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeKey = TABS[tab].key;

  const tabCount = useCallback(
    (key: TabKey): number => {
      if (key === 'all') return items.length;
      if (key === 'due_now') return counts.overdue + counts.due_today;
      if (key === 'overdue') return counts.overdue;
      if (key === 'today') return counts.due_today;
      return counts.upcoming;
    },
    [items.length, counts]
  );

  const visibleItems = useMemo(
    () => items.filter((t) => matchesTab(t, activeKey)),
    [items, activeKey]
  );

  const setRowBusy = (key: string, v: boolean) =>
    setBusy((b) => ({ ...b, [key]: v }));

  const handleMarkDone = async (task: MyTask) => {
    if (!task.enrollment_id || !task.step_id) return;
    const key = rowKey(task);
    setRowBusy(key, true);
    try {
      const notes = remarks[key]?.trim();
      await journeyService.updateStep(task.enrollment_id, task.step_id, {
        status: 'done',
        ...(notes ? { notes } : {}),
      });
      toast.success('Step marked done');
      setRemarks((r) => {
        const next = { ...r };
        delete next[key];
        return next;
      });
      await load();
    } catch (error) {
      console.error('Failed to mark step done:', error);
      toast.error('Failed to mark step done');
    } finally {
      setRowBusy(key, false);
    }
  };

  const handleReschedule = async (task: MyTask, date: Date | null) => {
    if (!task.enrollment_id || !task.step_id || !date) return;
    const key = rowKey(task);
    setRowBusy(key, true);
    try {
      const planned = date.toISOString().split('T')[0];
      await journeyService.updateStep(task.enrollment_id, task.step_id, { planned_date: planned });
      toast.success('Step rescheduled');
      await load();
    } catch (error) {
      console.error('Failed to reschedule step:', error);
      toast.error('Failed to reschedule step');
    } finally {
      setRowBusy(key, false);
    }
  };

  const handleSaveRemarks = async (task: MyTask) => {
    if (!task.enrollment_id || !task.step_id) return;
    const key = rowKey(task);
    const notes = remarks[key]?.trim();
    if (!notes) return;
    setRowBusy(key, true);
    try {
      await journeyService.updateStep(task.enrollment_id, task.step_id, { notes });
      toast.success('Remarks saved');
      await load();
    } catch (error) {
      console.error('Failed to save remarks:', error);
      toast.error('Failed to save remarks');
    } finally {
      setRowBusy(key, false);
    }
  };

  // --- Lead follow-up actions (wired to the LEAD services, not the journey) ---
  const handleFollowUpReschedule = async (task: MyTask, date: Date | null) => {
    if (!task.lead_id || !date) return;
    const key = rowKey(task);
    setRowBusy(key, true);
    try {
      await leadService.updateLead(task.lead_id, { follow_up_date: date.toISOString() });
      toast.success('Follow-up rescheduled');
      await load();
    } catch (error) {
      console.error('Failed to reschedule follow-up:', error);
      toast.error('Failed to reschedule follow-up');
    } finally {
      setRowBusy(key, false);
    }
  };

  const handleSaveFollowUpRemark = async (task: MyTask) => {
    if (!task.lead_id) return;
    const key = rowKey(task);
    const text = remarks[key]?.trim();
    if (!text) return;
    setRowBusy(key, true);
    try {
      await leadService.addComment(task.lead_id, { text });
      toast.success('Remark saved');
      setRemarks((r) => {
        const next = { ...r };
        delete next[key];
        return next;
      });
      await load();
    } catch (error) {
      console.error('Failed to save remark:', error);
      toast.error('Failed to save remark');
    } finally {
      setRowBusy(key, false);
    }
  };

  const emptyCopy: Record<TabKey, { title: string; body: string }> = {
    due_now: { title: 'No tasks due — you’re all caught up 🎉', body: 'Nothing overdue or due today.' },
    overdue: { title: 'Nothing overdue 🎉', body: 'You have no overdue tasks.' },
    today: { title: 'Nothing due today 🎉', body: 'No tasks are due today.' },
    upcoming: { title: 'Nothing in the next 7 days', body: 'No tasks coming up this week.' },
    all: { title: 'No tasks yet', body: 'Your follow-ups and care steps will appear here.' },
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

  const kpis: { key: string; label: string; value: number; color: string; icon: JSX.Element }[] = [
    { key: 'overdue', label: 'Overdue', value: counts.overdue, color: '#dc2626', icon: <ErrorOutlineIcon fontSize="small" /> },
    { key: 'today', label: 'Due today', value: counts.due_today, color: '#b26a00', icon: <TodayIcon fontSize="small" /> },
    { key: 'upcoming', label: 'Upcoming', value: counts.upcoming, color: brandColors.navyBlue, icon: <EventIcon fontSize="small" /> },
  ];

  const renderKpis = () => (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(3, minmax(160px, 240px))' },
        gap: 1.5,
        mb: 2.5,
      }}
    >
      {kpis.map((k) => (
        <Card
          key={k.key}
          sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: CARD_SHADOW }}
        >
          <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ color: k.color, display: 'flex' }}>{k.icon}</Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  {k.label}
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: k.color, lineHeight: 1.1 }}>
                  {k.value}
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      ))}
    </Box>
  );

  const renderDue = (task: MyTask) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
      <Typography
        variant="body2"
        sx={{
          fontWeight: task.is_overdue ? 700 : 500,
          color: task.is_overdue ? 'error.main' : 'text.primary',
        }}
      >
        {formatShortDateIST(task.due_date)}
      </Typography>
      {task.is_overdue && (
        <Chip
          label="Overdue"
          size="small"
          color="error"
          sx={{ fontSize: '0.6rem', height: 18, fontWeight: 700, '& .MuiChip-label': { px: 0.6 } }}
        />
      )}
    </Box>
  );

  const renderCareActions = (task: MyTask, key: string, isBusy: boolean) => (
    <Stack spacing={0.75} sx={{ minWidth: 220 }}>
      <TextField
        size="small"
        placeholder="Remarks (optional)"
        value={remarks[key] ?? ''}
        onChange={(e) => setRemarks((r) => ({ ...r, [key]: e.target.value }))}
        disabled={isBusy}
        multiline
        maxRows={3}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, justifyContent: 'flex-end' }}>
        <Tooltip title="Save remarks">
          <span>
            <IconButton
              size="small"
              disabled={isBusy || !(remarks[key]?.trim())}
              onClick={() => handleSaveRemarks(task)}
            >
              <SaveIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Box sx={{ width: 140 }}>
          <DatePicker
            label="Reschedule"
            value={null}
            onChange={(date) => handleReschedule(task, date as Date | null)}
            disabled={isBusy}
            slotProps={{ textField: { size: 'small', fullWidth: true } }}
          />
        </Box>
        <Tooltip title="Mark done">
          <span>
            <IconButton size="small" color="success" disabled={isBusy} onClick={() => handleMarkDone(task)}>
              <CheckCircleIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Open care journey">
          <span>
            <IconButton
              size="small"
              disabled={!task.enrollment_id}
              onClick={() => task.enrollment_id && navigate(`/tulip/enrollments/${task.enrollment_id}`, { state: { from: '/tulip/my-tasks' } })}
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Stack>
  );

  const renderFollowUpActions = (task: MyTask, key: string, isBusy: boolean) => (
    <Stack spacing={0.75} sx={{ minWidth: 220 }}>
      <TextField
        size="small"
        placeholder="Remarks (optional) — e.g. why rescheduled"
        value={remarks[key] ?? ''}
        onChange={(e) => setRemarks((r) => ({ ...r, [key]: e.target.value }))}
        disabled={isBusy}
        multiline
        maxRows={3}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, justifyContent: 'flex-end' }}>
        <Tooltip title="Save remark">
          <span>
            <IconButton
              size="small"
              disabled={isBusy || !(remarks[key]?.trim())}
              onClick={() => handleSaveFollowUpRemark(task)}
            >
              <SaveIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Box sx={{ width: 140 }}>
          <DatePicker
            label="Reschedule"
            value={null}
            onChange={(date) => handleFollowUpReschedule(task, date as Date | null)}
            disabled={isBusy}
            slotProps={{ textField: { size: 'small', fullWidth: true } }}
          />
        </Box>
        <Tooltip title="Open lead">
          <span>
            <IconButton
              size="small"
              disabled={!task.lead_id}
              onClick={() => task.lead_id && navigate(`/tulip/leads/${task.lead_id}`, { state: { from: '/tulip/my-tasks' } })}
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Stack>
  );

  const renderTable = () => (
    <TableContainer
      component={Card}
      sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: CARD_SHADOW }}
    >
      <Table size="small">
        <TableHead>
          <TableRow sx={{ '& th': { fontWeight: 700, color: 'text.secondary', bgcolor: 'rgba(30,64,136,0.04)' } }}>
            <TableCell>Type</TableCell>
            <TableCell>Person</TableCell>
            <TableCell>Action</TableCell>
            <TableCell>Service</TableCell>
            <TableCell>Due</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {visibleItems.map((task) => {
            const key = rowKey(task);
            const isBusy = !!busy[key];
            const isCare = task.task_type === 'care_step';
            const totalSteps = task.total ?? 0;
            const doneSteps = task.done ?? 0;
            const pct = totalSteps > 0 ? (doneSteps / totalSteps) * 100 : 0;
            return (
              <TableRow key={key} hover>
                <TableCell>
                  <Chip label={isCare ? 'Care' : 'Follow-up'} size="small" sx={typeChipSx(task.task_type)} />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {task.person_name || '—'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {task.phone_number || '—'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 140 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {task.action_name || '—'}
                      </Typography>
                      {task.step_type && <Chip label={task.step_type} size="small" sx={channelChipSx} />}
                    </Box>
                    {isCare && totalSteps > 0 && (
                      <Box sx={{ maxWidth: 130 }}>
                        <Typography variant="caption" color="text.secondary">
                          {doneSteps}/{totalSteps} done
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={pct}
                          sx={{
                            mt: 0.25,
                            height: 5,
                            borderRadius: 3,
                            bgcolor: 'rgba(30,64,136,0.08)',
                            '& .MuiLinearProgress-bar': { bgcolor: brandColors.navyBlue },
                          }}
                        />
                      </Box>
                    )}
                    {!isCare && task.status && (
                      <Box>
                        <Chip label={task.status} size="small" sx={statusChipSx} />
                      </Box>
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{task.service || '—'}</Typography>
                </TableCell>
                <TableCell>{renderDue(task)}</TableCell>
                <TableCell align="right">
                  {isCare ? renderCareActions(task, key, isBusy) : renderFollowUpActions(task, key, isBusy)}
                </TableCell>
              </TableRow>
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
          <AssignmentIcon sx={{ color: brandColors.navyBlue }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              My Tasks
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {loading
                ? 'Loading your tasks…'
                : `${total} task${total === 1 ? '' : 's'} on your worklist`}
            </Typography>
          </Box>
        </Box>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => load()} disabled={loading}>
          Refresh
        </Button>
      </Box>

      {/* KPI strip */}
      {renderKpis()}

      {/* Tabs */}
      <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', mb: 2.5 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            '& .MuiTab-root': { textTransform: 'none', fontWeight: 600 },
            '& .Mui-selected': { color: brandColors.navyBlue },
            '& .MuiTabs-indicator': { backgroundColor: brandColors.navyBlue },
          }}
        >
          {TABS.map((t) => (
            <Tab
              key={t.key}
              label={
                <Badge
                  color="primary"
                  badgeContent={tabCount(t.key)}
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
          ))}
        </Tabs>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 }}>
          <CircularProgress />
        </Box>
      ) : visibleItems.length === 0 ? (
        renderEmpty()
      ) : (
        renderTable()
      )}
    </Box>
  );
}
