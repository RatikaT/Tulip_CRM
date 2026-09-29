import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import { toast } from 'react-toastify';
import { dashboardService } from '../../services/dashboardService';
import { formatFullDateTimeIST } from '../../utils/dateUtils';
import type { Summary } from '../../types/summary.types';
import { C, NoteBullets, SectionCard, monoSx, pct } from './shared';

function scopeLabel(s: Summary): string {
  const rows = s.activity_metrics?.rows || [];
  return rows.length === 1 ? rows[0].name : 'All SPOCs';
}

function totalsLine(s: Summary): string {
  const t = s.activity_metrics?.totals;
  if (!t) return `${s.total_leads} actionable`;
  return `${t.total} actionable · ${t.acted} acted on (${pct(t.acted, t.total)}%)`;
}

export default function SavedReports({ isAdmin, refreshKey }: { isAdmin: boolean; refreshKey: number }) {
  const [list, setList] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [openItem, setOpenItem] = useState<Summary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setList(await dashboardService.getSummaries({ summary_type: 'spoc_report' }));
    } catch (err) {
      console.error('Failed to load saved reports:', err);
      toast.error('Failed to load saved reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const remove = async (s: Summary) => {
    if (!window.confirm(`Delete the saved report for ${s.summary_date || 'this period'}?`)) return;
    try {
      await dashboardService.deleteSummary(s.id);
      setList((prev) => prev.filter((x) => x.id !== s.id));
      toast.success('Report deleted');
    } catch (err) {
      console.error('Failed to delete report:', err);
      toast.error('Failed to delete report');
    }
  };

  const snap = openItem?.activity_metrics;
  const headCell = { fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary', bgcolor: C.sunk, lineHeight: 1.25 };

  return (
    <SectionCard
      title="Saved Reports"
      action={
        <Tooltip title="Refresh">
          <IconButton onClick={load} color="primary" size="small" aria-label="Refresh saved reports">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      }
      subtitle="Each one keeps the numbers as well as the AI note, so you can re-open it later."
    >
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      ) : list.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No saved reports yet.{isAdmin ? ' Use "Save report" above to keep one.' : ''}
        </Typography>
      ) : (
        <Box sx={{ display: 'grid', gap: 1 }}>
          {list.map((s) => (
            <Box
              key={s.id}
              sx={{
                border: `1px solid ${C.line}`,
                borderRadius: 2.5,
                px: 1.5,
                py: 1.25,
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px 14px',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>
                <b>{s.summary_date || '-'}</b> · {scopeLabel(s)}
              </span>
              <Typography variant="caption" color="text.secondary">
                {totalsLine(s)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Saved by {s.created_by_name || 'Unknown'}, {formatFullDateTimeIST(s.created_at)}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Button variant="outlined" size="small" onClick={() => setOpenItem(s)} sx={{ textTransform: 'none' }}>
                  Open
                </Button>
                {isAdmin && (
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => remove(s)} aria-label="Delete saved report">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      <Dialog open={!!openItem} onClose={() => setOpenItem(null)} maxWidth="lg" fullWidth>
        {openItem && (
          <>
            <DialogTitle sx={{ fontWeight: 700, pb: 0.5 }}>
              SPOC Report · {openItem.summary_date || '-'}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {scopeLabel(openItem)} · Saved by {openItem.created_by_name || 'Unknown'}, {formatFullDateTimeIST(openItem.created_at)}
              </Typography>
            </DialogTitle>
            <DialogContent dividers sx={{ display: 'grid', gap: 2 }}>
              {snap ? (
                <>
                  <Typography variant="body2">
                    New leads created <b>{snap.headline?.new_leads_created ?? 0}</b> · Assigned{' '}
                    <b>{snap.headline?.assigned ?? 0}</b> · Not yet assigned <b>{snap.headline?.unassigned ?? 0}</b> ·{' '}
                    {totalsLine(openItem)}
                  </Typography>
                  <TableContainer sx={{ border: `1px solid ${C.line}`, borderRadius: 2.5, overflowX: 'auto' }}>
                    <Table size="small" sx={{ minWidth: 900 }}>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={headCell}>SPOC</TableCell>
                          {[
                            'New assigned',
                            'Leads due',
                            'Leads overdue',
                            'Enrollments due',
                            'Enrollments overdue',
                            'Total actionable',
                            'Acted on',
                            'Not acted on',
                            'Enrolled',
                            'Closed (no sale)',
                          ].map((h) => (
                            <TableCell key={h} align="center" sx={headCell}>
                              {h}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {snap.rows.map((r, i) => (
                          <TableRow key={`${r.user_id ?? r.name}-${i}`}>
                            <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.name}</TableCell>
                            {[r.counts.newL, r.counts.due, r.counts.over, r.counts.enrDue, r.counts.enrOver, r.counts.total].map((v, j) => (
                              <TableCell key={j} align="center" sx={{ ...monoSx, color: v ? 'text.primary' : 'text.disabled' }}>
                                {v}
                              </TableCell>
                            ))}
                            <TableCell align="center" sx={{ ...monoSx, color: C.ok, fontWeight: 700 }}>{r.counts.acted}</TableCell>
                            <TableCell align="center" sx={{ ...monoSx, color: r.counts.not ? C.bad : 'text.disabled', fontWeight: 700 }}>{r.counts.not}</TableCell>
                            <TableCell align="center" sx={monoSx}>{r.results?.enrolled ?? 0}</TableCell>
                            <TableCell align="center" sx={monoSx}>{r.results?.closed ?? 0}</TableCell>
                          </TableRow>
                        ))}
                        {snap.rows.length > 1 && snap.totals && (
                          <TableRow sx={{ '& td': { fontWeight: 700, bgcolor: C.sunk } }}>
                            <TableCell>All SPOCs</TableCell>
                            {[snap.totals.newL, snap.totals.due, snap.totals.over, snap.totals.enrDue, snap.totals.enrOver, snap.totals.total, snap.totals.acted, snap.totals.not].map((v, j) => (
                              <TableCell key={j} align="center" sx={monoSx}>{v}</TableCell>
                            ))}
                            <TableCell align="center" sx={monoSx}>{snap.rows.reduce((t, r) => t + (r.results?.enrolled ?? 0), 0)}</TableCell>
                            <TableCell align="center" sx={monoSx}>{snap.rows.reduce((t, r) => t + (r.results?.closed ?? 0), 0)}</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  This saved report has no numbers attached.
                </Typography>
              )}
              <Box sx={{ border: `1px solid ${C.primarySoft}`, borderRadius: 3, px: 2, py: 1.5, display: 'grid', gap: 1 }}>
                <b>AI note</b>
                {openItem.content?.trim() ? (
                  <NoteBullets note={openItem.content} />
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No note was written for this report.
                  </Typography>
                )}
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setOpenItem(null)} sx={{ textTransform: 'none' }}>
                Close
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </SectionCard>
  );
}
