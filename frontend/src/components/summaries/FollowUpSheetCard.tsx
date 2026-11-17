import { useEffect, useState } from 'react';
import {
  Box, Button, CircularProgress, Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { toast } from 'react-toastify';
import api from '../../services/api';
import type { SpocItem, SpocReportParams } from '../../types/summary.types';
import type { DrawerContent } from './RecordDrawer';
import { C, SectionCard, errorDetail, monoSx } from './shared';

type Bucket = 'overdue' | 'due' | 'future';
interface SheetItem {
  type: 'lead' | 'enrollment';
  id: string;
  name: string;
  bucket: Bucket;
  date_label: string;
  actioned: boolean;
  actions: { at: string; what: string; by: string }[];
  status_start?: string;
  status_now?: string;
  service?: string;
  why?: string;
}
interface SheetRow { name: string; counts: Record<Bucket, [number, number]>; items: SheetItem[] }
interface SheetPart { rows: SheetRow[]; totals: Record<Bucket, [number, number]> }
interface FollowUpSheet {
  start: string; end: string; future_from: string; future_to: string;
  leads: SheetPart; enrollments: SheetPart;
}

const BUCKET_LABEL: Record<Bucket, string> = { overdue: 'Overdue', due: 'Due', future: 'Future (1 week)' };
const d = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

/** Sheet rows -> the drawer's item list (same look as the Daily SPOC Report). */
function toSpocItems(items: SheetItem[]): SpocItem[] {
  return items.map((i) => ({
    type: i.type,
    id: i.id,
    name: i.name,
    bucket: i.type === 'lead'
      ? (i.bucket === 'overdue' ? 'over' : i.bucket === 'due' ? 'due' : '')
      : (i.bucket === 'overdue' ? 'enrOver' : i.bucket === 'due' ? 'enrDue' : ''),
    why: i.type === 'lead'
      ? `Follow-up ${i.date_label} · status then: ${i.status_start} · now: ${i.status_now}`
      : `${i.why || ''}${i.service ? ` · ${i.service}` : ''}`,
    acted: i.actioned,
    actions: i.actions,
  })) as SpocItem[];
}

export default function FollowUpSheetCard({
  params,
  period,
  openDrawer,
}: {
  params: SpocReportParams;
  period: string;
  openDrawer: (c: DrawerContent) => void;
}) {
  const [sheet, setSheet] = useState<FollowUpSheet | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get<FollowUpSheet>('/dashboard/follow-up-sheet', {
      params: { start: params.start, end: params.end, ...(params.user_id ? { user_id: params.user_id } : {}) },
    })
      .then((r) => { if (alive) setSheet(r.data); })
      .catch((e) => { if (alive) toast.error(errorDetail(e, 'Failed to load the Follow-up Sheet')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [params.start, params.end, params.user_id]);

  const download = async () => {
    setDownloading(true);
    try {
      const res = await api.get('/dashboard/follow-up-sheet/export', {
        params: { start: params.start, end: params.end, ...(params.user_id ? { user_id: params.user_id } : {}) },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `follow_up_sheet_${params.start}_${params.end}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errorDetail(e, 'Failed to download the Follow-up Sheet'));
    } finally {
      setDownloading(false);
    }
  };

  const open = (who: string, items: SheetItem[], bucket: Bucket, actioned: boolean | null, kind: string) => {
    const list = items.filter((i) => i.bucket === bucket && (actioned === null || i.actioned === actioned));
    openDrawer({
      kind: 'items',
      title: `${who} · ${kind} · ${BUCKET_LABEL[bucket]}${actioned ? ' · actioned' : ''} (${list.length})`,
      sub: `${period}. Actioned = done within these dates.`,
      items: toSpocItems(list),
    });
  };

  const num = (v: number, onClick: () => void, tone?: string) => (
    v ? (
      <Button size="small" onClick={onClick} sx={{ minWidth: 0, fontWeight: 700, ...monoSx, color: tone || C.primary }}>
        {v}
      </Button>
    ) : <Typography component="span" sx={{ ...monoSx, color: 'text.disabled' }}>0</Typography>
  );

  const head = { fontWeight: 700, fontSize: '0.75rem', bgcolor: C.sunk, textAlign: 'center' as const, whiteSpace: 'nowrap' as const };
  const table = (part: SheetPart, kind: string, whoLabel: string) => (
    <Box sx={{ overflowX: 'auto', border: `1px solid ${C.line}`, borderRadius: 2.5 }}>
      <Table size="small" sx={{ minWidth: 760 }}>
        <TableHead>
          <TableRow>
            <TableCell rowSpan={2} sx={{ ...head, textAlign: 'left' }}>{whoLabel}</TableCell>
            <TableCell colSpan={2} sx={head}>Overdue</TableCell>
            <TableCell colSpan={2} sx={head}>Due</TableCell>
            <TableCell colSpan={2} sx={head}>Future (1 week: {sheet && `${d(sheet.future_from)}–${d(sheet.future_to)}`})</TableCell>
          </TableRow>
          <TableRow>
            {['Total Overdue', 'Actioned Overdue', 'Total Due', 'Actioned Due', 'Total Future', 'Actioned Future'].map((h) => (
              <TableCell key={h} sx={head}>{h}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {part.rows.length === 0 ? (
            <TableRow><TableCell colSpan={7} sx={{ color: 'text.secondary', textAlign: 'center' }}>Nothing in these dates.</TableCell></TableRow>
          ) : part.rows.map((r) => (
            <TableRow key={r.name} hover>
              <TableCell sx={{ fontWeight: 600 }}>{r.name}</TableCell>
              {(['overdue', 'due', 'future'] as Bucket[]).map((b) => [
                <TableCell key={`${b}t`} align="center">{num(r.counts[b][0], () => open(r.name, r.items, b, null, kind))}</TableCell>,
                <TableCell key={`${b}a`} align="center">{num(r.counts[b][1], () => open(r.name, r.items, b, true, kind), C.ok)}</TableCell>,
              ])}
            </TableRow>
          ))}
          {part.rows.length > 1 && (
            <TableRow sx={{ '& td': { fontWeight: 700, bgcolor: C.sunk } }}>
              <TableCell>Total</TableCell>
              {(['overdue', 'due', 'future'] as Bucket[]).map((b) => [
                <TableCell key={`${b}t`} align="center" sx={monoSx}>{part.totals[b][0]}</TableCell>,
                <TableCell key={`${b}a`} align="center" sx={monoSx}>{part.totals[b][1]}</TableCell>,
              ])}
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Box>
  );

  return (
    <SectionCard
      title="Follow-up Sheet"
      action={
        <Button
          variant="outlined"
          size="small"
          onClick={download}
          disabled={downloading || !sheet}
          startIcon={downloading ? <CircularProgress size={14} /> : <DownloadIcon />}
          sx={{ textTransform: 'none', fontWeight: 600 }}
        >
          Download
        </Button>
      }
      subtitle={<>Per SPOC for {period}: follow-ups that were overdue, due, or due in the next 7 days, and how many were actioned <b>within these dates</b>. Click any number for the list.</>}
    >
      {loading && !sheet ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>
      ) : sheet && (
        <Box sx={{ display: 'grid', gap: 2, opacity: loading ? 0.6 : 1 }}>
          <Box sx={{ display: 'grid', gap: 1 }}>
            <Typography sx={{ fontWeight: 700 }}>Leads</Typography>
            <Typography variant="caption" color="text.secondary">
              Only leads in Follow up-In Process or Follow up-No Response. Overdue = follow-up date before the start date; Due = within the dates;
              Future = the 7 days after. Actioned = status changed, call added, remark added or follow-up date changed within the dates.
            </Typography>
            {table(sheet.leads, 'Leads', 'SPOC Name')}
          </Box>
          <Box sx={{ display: 'grid', gap: 1 }}>
            <Typography sx={{ fontWeight: 700 }}>Enrollments</Typography>
            <Typography variant="caption" color="text.secondary">
              Customers with an active care journey, counted once each in their most urgent bucket, using the Next Follow-up Due date and care steps.
              Actioned = call / follow-up logged, care step done / skipped / rescheduled, next date or remarks changed, journey paused / stopped, or DNC within the dates.
            </Typography>
            {table(sheet.enrollments, 'Enrollments', 'Nurture Buddy')}
          </Box>
        </Box>
      )}
    </SectionCard>
  );
}
