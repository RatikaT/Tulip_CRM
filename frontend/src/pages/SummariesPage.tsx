import { useCallback, useEffect, useState } from 'react';
import { Box, Button, CircularProgress, MenuItem, Paper, TextField, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import { toast } from 'react-toastify';
import api from '../services/api';
import { todayISTKey } from '../utils/dateUtils';
import { useAuthStore } from '../stores/authStore';
import type { SpocReportParams } from '../types/summary.types';
import FollowUpSheetCard from '../components/summaries/FollowUpSheetCard';
import RecordDrawer, { DrawerContent } from '../components/summaries/RecordDrawer';
import { cardSx, periodLabel } from '../components/summaries/shared';

interface UserOption {
  id: string;
  full_name: string;
}

export default function SummariesPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [start, setStart] = useState(todayISTKey());
  const [end, setEnd] = useState(todayISTKey());
  const [spoc, setSpoc] = useState('');
  const [users, setUsers] = useState<UserOption[]>([]);

  // Dates (and SPOC) the sheet below was loaded with; the sheet fetches its own data.
  const [loaded, setLoaded] = useState<SpocReportParams | null>(null);
  const loading = false;
  const [drawer, setDrawer] = useState<DrawerContent | null>(null);

  const load = useCallback((p: SpocReportParams) => {
    if (p.end < p.start) {
      toast.error('"To" date is before "From" date');
      return;
    }
    setLoaded({ ...p });
  }, []);

  useEffect(() => {
    load({ start: todayISTKey(), end: todayISTKey() });
  }, [load]);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .get<{ users: UserOption[] }>('/users')
      .then((res) => setUsers(res.data.users || []))
      .catch((err) => console.error('Failed to fetch users:', err));
  }, [isAdmin]);

  const quick = (q: 'today' | 'yday' | 'week') => {
    if (q === 'today') {
      setStart(todayISTKey());
      setEnd(todayISTKey());
    } else if (q === 'yday') {
      setStart(todayISTKey(-1));
      setEnd(todayISTKey(-1));
    } else {
      setStart(todayISTKey(-6));
      setEnd(todayISTKey());
    }
  };

  const period = loaded ? periodLabel(loaded.start, loaded.end) : '';
  const quickBtn = { textTransform: 'none' as const, color: 'text.primary', borderColor: 'divider', fontWeight: 500 };

  // Activity Log MIS (moved here from the Dashboard): every action done in the chosen dates
  const [activityBusy, setActivityBusy] = useState(false);
  const downloadActivityLog = async () => {
    if (end < start) {
      toast.error('"To" date is before "From" date');
      return;
    }
    setActivityBusy(true);
    try {
      const res = await api.get('/dashboard/activity-log/export', { params: { start, end }, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `activity_log_mis_${start}_to_${end}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download Activity Log MIS:', err);
      toast.error('Failed to download Activity Log MIS');
    } finally {
      setActivityBusy(false);
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Summaries
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '70ch' }}>
          Pick the dates once at the top. The Follow-up &amp; SPOC Sheet shows what each SPOC had to follow up and what they
          actioned on those dates; the Activity Log MIS lists everything anyone did on those dates.
        </Typography>
      </Box>

      {/* Controls */}
      <Paper elevation={0} sx={{ ...cardSx, mb: 3, px: 2.25, py: 2, display: 'grid', gap: 1.25 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, alignItems: 'center' }}>
          <TextField
            size="small"
            type="date"
            label="From"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 165 }}
          />
          <TextField
            size="small"
            type="date"
            label="To"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 165 }}
          />
          {isAdmin && (
            <TextField
              select
              size="small"
              label="SPOC"
              value={spoc}
              onChange={(e) => setSpoc(e.target.value)}
              InputLabelProps={{ shrink: true }}
              SelectProps={{ displayEmpty: true }}
              sx={{ minWidth: 190 }}
            >
              <MenuItem value="">All SPOCs</MenuItem>
              {users.map((u) => (
                <MenuItem key={u.id} value={u.id}>
                  {u.full_name}
                </MenuItem>
              ))}
            </TextField>
          )}
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            <Button variant="outlined" size="small" sx={quickBtn} onClick={() => quick('today')}>
              Today
            </Button>
            <Button variant="outlined" size="small" sx={quickBtn} onClick={() => quick('yday')}>
              Yesterday
            </Button>
            <Button variant="outlined" size="small" sx={quickBtn} onClick={() => quick('week')}>
              Last 7 days
            </Button>
          </Box>
          <Button
            variant="contained"
            onClick={() => load({ start, end, ...(isAdmin && spoc ? { user_id: spoc } : {}) })}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            Load
          </Button>
          {isAdmin && (
            <Button
              variant="outlined"
              onClick={downloadActivityLog}
              disabled={activityBusy}
              startIcon={activityBusy ? <CircularProgress size={14} /> : <DownloadIcon />}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Activity Log MIS
            </Button>
          )}
        </Box>
        {loaded && (
          <Typography variant="caption" color="text.secondary">
            Showing {period} (IST).
          </Typography>
        )}
      </Paper>

      {loaded && <FollowUpSheetCard params={loaded} period={period} openDrawer={setDrawer} />}

      <RecordDrawer content={drawer} onClose={() => setDrawer(null)} />
    </Box>
  );
}
