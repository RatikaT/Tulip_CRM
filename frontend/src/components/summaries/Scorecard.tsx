import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  MenuItem,
  Grid,
  Button,
  CircularProgress,
  Divider,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  LinearProgress,
} from '@mui/material';
import AssessmentIcon from '@mui/icons-material/Assessment';
import { format, subDays } from 'date-fns';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { dashboardService } from '../../services/dashboardService';
import { useAuthStore } from '../../stores/authStore';
import type { ScorecardResponse } from '../../types/summary.types';

interface ScorecardUser {
  id: string;
  full_name: string;
}

const TEAM_VALUE = '__team__';

// Small KPI tile
function Tile({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <Box
      sx={{
        flex: '1 1 130px',
        minWidth: 120,
        p: 1.5,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: `${color}0D`,
      }}
    >
      <Typography variant="h5" sx={{ fontWeight: 700, color }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5, mt: 1 }}>
      {children}
    </Typography>
  );
}

export default function Scorecard() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [agents, setAgents] = useState<ScorecardUser[]>([]);
  // For admins the dropdown holds either TEAM_VALUE or a specific user id.
  const [selected, setSelected] = useState<string>(isAdmin ? TEAM_VALUE : '');
  const [start, setStart] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [end, setEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ScorecardResponse | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const res = await api.get<{ users: ScorecardUser[] }>('/users');
        setAgents(res.data.users || []);
      } catch {
        /* non-fatal */
      }
    })();
  }, [isAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { user_id?: string; start?: string; end?: string; team?: boolean } = {
        start,
        end,
      };
      if (isAdmin) {
        if (selected === TEAM_VALUE) params.team = true;
        else if (selected) params.user_id = selected;
      }
      const res = await dashboardService.getScorecard(params);
      setData(res);
    } catch (error) {
      console.error('Failed to load scorecard:', error);
      toast.error('Failed to load scorecard');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, selected, start, end]);

  const inputSx = {
    '& .MuiOutlinedInput-root': {
      borderRadius: 2.5,
      '&.Mui-focused': { boxShadow: '0 0 0 3px rgba(30,64,136,0.12)' },
    },
  };

  const lead = data?.lead;
  const care = data?.care;
  const outreach = data?.outreach;
  const statusEntries = lead ? Object.entries(lead.status_bifurcation) : [];
  const statusMax = statusEntries.reduce((m, [, v]) => Math.max(m, v), 0) || 1;
  const closedReasons = lead ? Object.entries(lead.closed.by_reason) : [];

  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        mb: 3,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        boxShadow: '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <AssessmentIcon color="primary" />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Performance Scorecard
        </Typography>
      </Box>

      {/* Controls */}
      <Grid container spacing={2} alignItems="center" sx={{ mb: 1 }}>
        {isAdmin && (
          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              size="small"
              select
              label="Scope"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              sx={inputSx}
            >
              <MenuItem value={TEAM_VALUE}>Team (all agents)</MenuItem>
              {agents.map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.full_name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        )}
        <Grid item xs={6} sm={2}>
          <TextField
            fullWidth
            size="small"
            type="date"
            label="From"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={inputSx}
          />
        </Grid>
        <Grid item xs={6} sm={2}>
          <TextField
            fullWidth
            size="small"
            type="date"
            label="To"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={inputSx}
          />
        </Grid>
        <Grid item xs={12} sm={2}>
          <Button
            variant="contained"
            onClick={load}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} /> : <AssessmentIcon />}
            fullWidth
          >
            {loading ? 'Loading...' : 'Load'}
          </Button>
        </Grid>
      </Grid>

      {!data && !loading && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Pick a {isAdmin ? 'scope and ' : ''}date range, then click Load.
        </Typography>
      )}

      {data && (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {data.scope.mode === 'team'
              ? 'Team (all agents)'
              : data.scope.user_name || 'You'}{' '}
            · {data.scope.start} → {data.scope.end}
          </Typography>

          {/* ① Lead Journey */}
          <SectionTitle>① Lead Journey</SectionTitle>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
            <Tile label="Assigned in range" value={lead!.assigned} color="#1E4088" />
            <Tile label="Follow-ups done" value={lead!.follow_ups_done} color="#0f8a63" />
            <Tile label="Closed (no sale)" value={lead!.closed.total} color="#dc2626" />
            <Tile label="Enrolled" value={lead!.enrolled} color="#7B4B94" />
          </Box>

          {statusEntries.length > 0 && (
            <>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                Status bifurcation (of assigned)
              </Typography>
              <Box sx={{ mb: 2 }}>
                {statusEntries.map(([status, count]) => (
                  <Box key={status} sx={{ mb: 0.75 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="caption">{status}</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        {count}
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={(count / statusMax) * 100}
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                  </Box>
                ))}
              </Box>
            </>
          )}

          {closedReasons.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                Closed — reasons
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Reason</TableCell>
                    <TableCell align="right">Count</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {closedReasons.map(([reason, count]) => (
                    <TableRow key={reason}>
                      <TableCell>{reason}</TableCell>
                      <TableCell align="right">{count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}

          <Divider sx={{ my: 2 }} />

          {/* ② Care Journey */}
          <SectionTitle>② Care Journey</SectionTitle>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
            <Tile label="Patients (active)" value={care!.patients} color="#1E4088" />
            <Tile label="Steps due in range" value={care!.steps_due} color="#b26a00" />
            <Tile label="Steps done in range" value={care!.steps_done} color="#0f8a63" />
            <Tile label="Steps overdue" value={care!.steps_overdue} color="#dc2626" />
            <Tile label="Steps skipped" value={care!.steps_skipped} color="#475569" />
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
            Progress buckets (patients)
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
            <Tile label="Early (0–33%)" value={care!.buckets.early} color="#dc2626" />
            <Tile label="Mid (34–66%)" value={care!.buckets.mid} color="#b26a00" />
            <Tile label="Near done (67–100%)" value={care!.buckets.near_done} color="#0f8a63" />
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 1 }}>
            <Tile
              label="PreConception → Antenatal"
              value={care!.conversions}
              color="#7B4B94"
            />
            <Tile label="Journeys completed" value={care!.journeys_completed} color="#0f8a63" />
          </Box>

          {/* ③ Outreach (admin only) */}
          {outreach && (
            <>
              <Divider sx={{ my: 2 }} />
              <SectionTitle>③ Outreach Journey</SectionTitle>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                <Tile label="Touchpoints done" value={outreach.touchpoints_done} color="#0f8a63" />
                <Tile
                  label="Touchpoints pending"
                  value={outreach.touchpoints_pending}
                  color="#b26a00"
                />
                <Tile
                  label="Touchpoints overdue"
                  value={outreach.touchpoints_overdue}
                  color="#dc2626"
                />
                <Tile label="Leads re-engaged" value={outreach.re_engaged} color="#7B4B94" />
              </Box>
            </>
          )}
        </>
      )}
    </Paper>
  );
}
