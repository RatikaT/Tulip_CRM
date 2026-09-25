import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import TimelineIcon from '@mui/icons-material/Timeline';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { formatToIST, todayISTKey } from '../../utils/dateUtils';

interface PersonActivity {
  name: string;
  leads_worked: number;
  enrollments_worked: number;
  total_actions: number;
  last_activity: string | null;
  counts: Record<string, number>;
}

interface ActivitySummaryResponse {
  start: string;
  end: string;
  columns: string[];
  people: PersonActivity[];
  total_actions: number;
}

/**
 * Who did what across Leads and Enrollments for the chosen IST dates, one row
 * per person, plus the Activity Log MIS download (one row per action).
 */
export default function ActivitySummary() {
  const [start, setStart] = useState(todayISTKey());
  const [end, setEnd] = useState(todayISTKey());
  const [data, setData] = useState<ActivitySummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    if (end < start) {
      toast.error('"To" date is before "From" date');
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<ActivitySummaryResponse>('/dashboard/activity-summary', {
        params: { start, end },
      });
      setData(res.data);
    } catch (err) {
      console.error('Failed to load activity summary:', err);
      toast.error('Failed to load activity summary');
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => {
    load();
    // Load once for today; afterwards the user presses Load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const download = async () => {
    if (end < start) {
      toast.error('"To" date is before "From" date');
      return;
    }
    setDownloading(true);
    try {
      const res = await api.get('/dashboard/activity-log/export', {
        params: { start, end },
        responseType: 'blob',
      });
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
      setDownloading(false);
    }
  };

  const columns = data?.columns || [];
  const headCell = { fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap' as const, bgcolor: '#f5f7fb' };
  const numCell = (v: number, key?: string) => (
    <TableCell key={key} align="center" sx={{ color: v ? 'text.primary' : 'text.disabled' }}>{v}</TableCell>
  );

  return (
    <Paper sx={{ p: 2, mb: 3, border: '1px solid #e0e0e0' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5, mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TimelineIcon sx={{ color: '#1E4088', fontSize: 20 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#1E4088' }}>
            Activity Summary
          </Typography>
          {data && (
            <Typography variant="caption" color="text.secondary">
              · {data.total_actions} actions by {data.people.length} people
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <TextField
            size="small" type="date" label="From" value={start}
            onChange={(e) => setStart(e.target.value)}
            InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
          />
          <TextField
            size="small" type="date" label="To" value={end}
            onChange={(e) => setEnd(e.target.value)}
            InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
          />
          <Button
            variant="outlined" size="small" onClick={load} disabled={loading}
            startIcon={loading ? <CircularProgress size={14} /> : <RefreshIcon />}
            sx={{ textTransform: 'none' }}
          >
            Load
          </Button>
          <Button
            variant="contained" size="small" onClick={download} disabled={downloading}
            startIcon={downloading ? <CircularProgress size={14} color="inherit" /> : <DownloadIcon />}
            sx={{ textTransform: 'none' }}
          >
            Activity Log MIS
          </Button>
        </Box>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Counts every action taken on the chosen dates (IST): status changes, follow-up date changes,
        calls, remarks, enrollment follow-ups and care/outreach steps. "Worked" = distinct records touched.
      </Typography>

      {loading && !data ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>
      ) : !data || data.people.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
          No activity recorded for these dates.
        </Typography>
      ) : (
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headCell}>Person</TableCell>
                <TableCell sx={headCell} align="center">Leads worked</TableCell>
                <TableCell sx={headCell} align="center">Enrollments worked</TableCell>
                {columns.map((c) => (
                  <TableCell key={c} sx={headCell} align="center">{c}</TableCell>
                ))}
                <TableCell sx={headCell} align="center">Total actions</TableCell>
                <TableCell sx={headCell}>Last activity</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.people.map((p) => (
                <TableRow key={p.name} hover>
                  <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{p.name}</TableCell>
                  {numCell(p.leads_worked)}
                  {numCell(p.enrollments_worked)}
                  {columns.map((c) => numCell(p.counts[c] || 0, c))}
                  <TableCell align="center" sx={{ fontWeight: 700 }}>{p.total_actions}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatToIST(p.last_activity, 'dd MMM, hh:mm a')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
}
