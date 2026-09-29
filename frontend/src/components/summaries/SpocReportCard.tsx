import { Fragment, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SaveIcon from '@mui/icons-material/Save';
import { toast } from 'react-toastify';
import { dashboardService } from '../../services/dashboardService';
import { formatToIST } from '../../utils/dateUtils';
import type { SpocCountKey, SpocReport, SpocReportParams, SpocReportRow } from '../../types/summary.types';
import type { DrawerContent } from './RecordDrawer';
import {
  C,
  ItemList,
  LABEL,
  NoteBullets,
  NumButton,
  SectionCard,
  SplitBar,
  errorDetail,
  filterItems,
  monoSx,
  pct,
  rowKey,
} from './shared';

const COLS: SpocCountKey[] = ['newL', 'due', 'over', 'enrDue', 'enrOver', 'total', 'acted', 'not'];
const SEP_COLS = new Set<SpocCountKey>(['newL', 'enrDue', 'total']);
const sep = { borderLeft: `2px solid ${C.line}` };

function Kpi({ value, label, color }: { value: string | number; label: string; color?: string }) {
  return (
    <Box sx={{ bgcolor: C.sunk, borderRadius: 3, px: 1.75, py: 1.5, display: 'grid', gap: 0.25 }}>
      <Box component="b" sx={{ ...monoSx, fontSize: '1.5rem', lineHeight: 1.1, color }}>
        {value}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
        {label}
      </Typography>
    </Box>
  );
}

export default function SpocReportCard({
  report,
  params,
  period,
  isAdmin,
  openDrawer,
  onSaved,
}: {
  report: SpocReport;
  params: SpocReportParams;
  period: string;
  isAdmin: boolean;
  openDrawer: (c: DrawerContent) => void;
  onSaved: () => void;
}) {
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');
  const [writing, setWriting] = useState(false);
  const [saving, setSaving] = useState(false);

  // A new report means a new note.
  useEffect(() => {
    setOpenRow(null);
    setNote('');
    setNoteError('');
  }, [report]);

  const T = report.totals;
  const H = report.headline;

  const show = (row: SpocReportRow, key: SpocCountKey) => {
    const items = filterItems(row.items, key);
    openDrawer({
      kind: 'items',
      title: `${row.name} · ${LABEL[key]} (${items.length})`,
      sub: `${period} · Click a record ID to open the lead or enrollment.`,
      items,
    });
  };

  const download = async () => {
    setDownloading(true);
    try {
      await dashboardService.downloadSpocReport(params);
    } catch (err) {
      console.error('Failed to download SPOC report MIS:', err);
      toast.error('Failed to download MIS');
    } finally {
      setDownloading(false);
    }
  };

  const writeNote = async () => {
    setWriting(true);
    setNoteError('');
    try {
      const n = await dashboardService.getSpocAiNote(params);
      setNote(n);
      if (!n.trim()) setNoteError('The AI returned an empty note. Please try again.');
    } catch (err) {
      console.error('AI note failed:', err);
      setNoteError(errorDetail(err, "Couldn't write the note right now. Please try again."));
    } finally {
      setWriting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await dashboardService.saveSpocReport(params, note);
      toast.success('Report saved');
      onSaved();
    } catch (err) {
      console.error('Failed to save report:', err);
      toast.error(errorDetail(err, 'Failed to save report'));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (k: string) => setOpenRow((cur) => (cur === k ? null : k));

  const headCell = { fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary', bgcolor: C.sunk, lineHeight: 1.25, verticalAlign: 'bottom' };
  const grpCell = { ...headCell, fontSize: '0.68rem', textTransform: 'uppercase' as const, letterSpacing: '0.06em', borderBottom: 0, pb: 0 };

  return (
    <SectionCard
      title="Daily SPOC Report"
      action={
        <Button
          variant="outlined"
          size="small"
          onClick={download}
          disabled={downloading}
          startIcon={downloading ? <CircularProgress size={14} /> : <DownloadIcon />}
          sx={{ textTransform: 'none' }}
        >
          Download MIS
        </Button>
      }
      subtitle="What each SPOC had to do in the chosen dates, and whether it got done."
    >
      {/* Headline strip */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 1.25 }}>
        {isAdmin ? (
          <>
            <Kpi value={H.new_leads_created} label="New leads created" />
            <Kpi value={H.assigned} label="Assigned to SPOCs" />
            <Kpi value={H.unassigned} label="Not yet assigned" color={H.unassigned ? C.warn : undefined} />
            <Kpi value={T.total} label="Actionable (all SPOCs)" />
            <Kpi value={T.total ? `${pct(T.acted, T.total)}%` : '-'} label="Acted on" color={C.ok} />
          </>
        ) : (
          <>
            <Kpi value={T.total} label="Actionable for you" />
            <Kpi value={T.acted} label="Done" color={C.ok} />
            <Kpi value={T.not} label="Still to do" color={C.bad} />
          </>
        )}
      </Box>

      {/* Report table */}
      {report.rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Nothing to show for these dates.
        </Typography>
      ) : (
        <TableContainer sx={{ border: `1px solid ${C.line}`, borderRadius: 3, overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 900, '& td, & th': { px: 1.5 } }}>
            <TableHead>
              <TableRow>
                <TableCell rowSpan={2} sx={headCell}>SPOC</TableCell>
                <TableCell colSpan={3} align="center" sx={{ ...grpCell, ...sep }}>Leads</TableCell>
                <TableCell colSpan={2} align="center" sx={{ ...grpCell, ...sep }}>Enrollments</TableCell>
                <TableCell colSpan={3} align="center" sx={{ ...grpCell, ...sep }}>Result</TableCell>
              </TableRow>
              <TableRow>
                <TableCell align="center" sx={{ ...headCell, ...sep }}>New assigned</TableCell>
                <TableCell align="center" sx={headCell}>Due for follow-up</TableCell>
                <TableCell align="center" sx={headCell}>Overdue</TableCell>
                <TableCell align="center" sx={{ ...headCell, ...sep }}>Due (follow-up or care step)</TableCell>
                <TableCell align="center" sx={headCell}>Overdue</TableCell>
                <TableCell align="center" sx={{ ...headCell, ...sep }}>Total actionable</TableCell>
                <TableCell align="center" sx={headCell}>Acted on</TableCell>
                <TableCell align="center" sx={headCell}>Not acted on</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {report.rows.map((row) => {
                const k = rowKey(row);
                const isOpen = openRow === k;
                return (
                  <Fragment key={k}>
                    <TableRow
                      hover
                      tabIndex={0}
                      aria-expanded={isOpen}
                      onClick={() => toggle(k)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggle(k);
                        }
                      }}
                      sx={{ cursor: 'pointer', '&:focus-visible': { outline: `2px solid ${C.primary}`, outlineOffset: -2 } }}
                    >
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Box
                          component="span"
                          sx={{ display: 'inline-block', width: 14, color: C.faint, transition: 'transform .15s', transform: isOpen ? 'rotate(90deg)' : 'none' }}
                        >
                          ▸
                        </Box>
                        <b>{row.name}</b>
                      </TableCell>
                      {COLS.map((c) => (
                        <TableCell key={c} align="center" sx={{ whiteSpace: 'nowrap', ...(SEP_COLS.has(c) ? sep : {}) }}>
                          <NumButton
                            value={row.counts[c]}
                            tone={c === 'acted' ? 'ok' : c === 'not' ? 'bad' : undefined}
                            label={LABEL[c]}
                            onClick={() => show(row, c)}
                          />
                          {c === 'acted' && row.counts.total > 0 && (
                            <Box component="span" sx={{ ml: 1 }}>
                              <SplitBar acted={row.counts.acted} total={row.counts.total} />
                            </Box>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={9} sx={{ p: 0, bgcolor: 'background.paper' }}>
                          <Box sx={{ pl: 4.5, pr: 2.25, pt: 1.75, pb: 2.25, display: 'grid', gap: 1.25 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                              <b>{row.name}'s list · {period}</b>
                              <Typography variant="caption" color="text.secondary">
                                {row.counts.acted} of {row.counts.total} done
                                {row.last_action_at ? ` · last action ${formatToIST(row.last_action_at, 'dd MMM, hh:mm a')}` : ''}
                              </Typography>
                            </Box>
                            <ItemList items={row.items} empty="Nothing was on the list for these dates." />
                            <Typography variant="caption" sx={{ fontWeight: 700 }}>
                              Other work done (not on the list)
                            </Typography>
                            <ItemList items={row.extra} empty="No other work recorded." />
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
              {isAdmin && (
                <TableRow sx={{ '& td': { fontWeight: 700, bgcolor: C.sunk } }}>
                  <TableCell>All SPOCs</TableCell>
                  {COLS.map((c) => (
                    <TableCell key={c} align="center" sx={{ ...monoSx, ...(SEP_COLS.has(c) ? sep : {}) }}>
                      {T[c]}
                    </TableCell>
                  ))}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* How it's counted */}
      <Box sx={{ borderLeft: `3px solid ${C.primary}`, bgcolor: C.primarySoft, px: 1.75, py: 1.25, borderRadius: '0 10px 10px 0', fontSize: '0.84rem' }}>
        <b>How it's counted</b>
        <Box component="ul" sx={{ mt: 0.5, mb: 0, pl: 2.25, display: 'grid', gap: 0.4 }}>
          <li><b>Overdue</b>: follow-up date is before the chosen dates and nothing has been done on it since.</li>
          <li><b>Enrollments due</b>: Next Follow-up Due <i>or</i> a care step planned in the dates, counted once per customer.</li>
          <li>A lead that is new <i>and</i> due is counted once in <b>Total actionable</b>.</li>
          <li><b>Acted on (lead)</b>: status changed, follow-up remark added, call added, or follow-up date changed. Saving with no change doesn't count.</li>
          <li><b>Acted on (enrollment)</b>: follow-up logged, next follow-up date changed, remarks/feedback edited, care step done / rescheduled / skipped, journey stopped or DNC.</li>
          <li>It counts even if someone else did it. The list shows who.</li>
        </Box>
      </Box>

      {/* AI note */}
      <Box sx={{ border: `1px solid ${C.primarySoft}`, borderRadius: 3, px: 2, py: 1.75, display: 'grid', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <b>AI note</b>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              size="small"
              onClick={writeNote}
              disabled={writing}
              startIcon={writing ? <CircularProgress size={14} /> : <AutoAwesomeIcon />}
              sx={{ textTransform: 'none' }}
            >
              {note ? 'Rewrite note' : 'Write note'}
            </Button>
            {isAdmin && (
              <Button
                variant="contained"
                size="small"
                onClick={save}
                disabled={saving}
                startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
                sx={{ textTransform: 'none' }}
              >
                Save report
              </Button>
            )}
          </Box>
        </Box>
        <Typography variant="caption" color="text.secondary">
          The AI only reads the numbers above. It never counts anything itself.
          {isAdmin && ' Saving keeps the numbers and the note (if written) so you can re-open them later.'}
        </Typography>
        {noteError && (
          <Alert severity="warning" sx={{ py: 0.25 }}>
            {noteError}
          </Alert>
        )}
        {note && <NoteBullets note={note} />}
      </Box>
    </SectionCard>
  );
}
