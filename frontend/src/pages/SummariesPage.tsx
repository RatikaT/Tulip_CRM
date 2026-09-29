import { useCallback, useEffect, useState } from 'react';
import { Box, Button, CircularProgress, MenuItem, Paper, TextField, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { toast } from 'react-toastify';
import api from '../services/api';
import { dashboardService } from '../services/dashboardService';
import { todayISTKey } from '../utils/dateUtils';
import { useAuthStore } from '../stores/authStore';
import type { SpocReport, SpocReportParams } from '../types/summary.types';
import SpocReportCard from '../components/summaries/SpocReportCard';
import SpocScorecard from '../components/summaries/SpocScorecard';
import SavedReports from '../components/summaries/SavedReports';
import RecordDrawer, { DrawerContent } from '../components/summaries/RecordDrawer';
import { cardSx, errorDetail, periodLabel } from '../components/summaries/shared';

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

  const [report, setReport] = useState<SpocReport | null>(null);
  // Params the current report was loaded with (download / AI note / save reuse them).
  const [loaded, setLoaded] = useState<SpocReportParams | null>(null);
  const [loading, setLoading] = useState(false);
  const [drawer, setDrawer] = useState<DrawerContent | null>(null);
  const [savedKey, setSavedKey] = useState(0);

  const load = useCallback(
    async (p: SpocReportParams) => {
      if (p.end < p.start) {
        toast.error('"To" date is before "From" date');
        return;
      }
      setLoading(true);
      try {
        const data = await dashboardService.getSpocReport(p);
        setReport(data);
        setLoaded(p);
      } catch (err) {
        console.error('Failed to load SPOC report:', err);
        toast.error(errorDetail(err, 'Failed to load SPOC report'));
      } finally {
        setLoading(false);
      }
    },
    []
  );

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

  const period = report ? periodLabel(report.start, report.end) : '';
  const quickBtn = { textTransform: 'none' as const, color: 'text.primary', borderColor: 'divider', fontWeight: 500 };

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Summaries
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '70ch' }}>
          Pick the dates once at the top, and every section uses them. Click any number to see the leads or customers
          behind it. Click a SPOC's row to see their day.
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
        </Box>
        {report && (
          <Typography variant="caption" color="text.secondary">
            Showing {period} (IST).
          </Typography>
        )}
      </Paper>

      {!report ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          {loading ? (
            <CircularProgress />
          ) : (
            <Typography variant="body2" color="text.secondary">
              Couldn't load the report. Press Load to try again.
            </Typography>
          )}
        </Box>
      ) : (
        <Box sx={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
          <SpocReportCard
            report={report}
            params={loaded as SpocReportParams}
            period={period}
            isAdmin={isAdmin}
            openDrawer={setDrawer}
            onSaved={() => setSavedKey((k) => k + 1)}
          />
          <SpocScorecard
            report={report}
            period={period}
            isAdmin={isAdmin}
            preferredKey={loaded?.user_id}
            openDrawer={setDrawer}
          />
        </Box>
      )}

      <SavedReports isAdmin={isAdmin} refreshKey={savedKey} />

      <RecordDrawer content={drawer} onClose={() => setDrawer(null)} />
    </Box>
  );
}
