import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Box, MenuItem, TextField, Typography } from '@mui/material';
import { formatToIST } from '../../utils/dateUtils';
import type { SpocBucket, SpocReport, SpocReportRow } from '../../types/summary.types';
import type { DrawerContent } from './RecordDrawer';
import { C, NumButton, SectionCard, SplitBar, filterItems, monoSx, pct, rowKey } from './shared';

const STATUS_FALLBACK = ['#1E4088', '#a15c00', '#6b3f8a', '#0f7b8a', '#E84A8A', '#5b6478'];

function statusColor(status: string, i: number): string {
  const s = status.toLowerCase();
  if (s.includes('enrolled')) return C.ok;
  if (s.includes('not interested') || s.includes('closed') || s.includes('lost') || s.includes('junk')) return C.bad;
  if (s.includes('no response')) return C.warn;
  if (s.includes('in process')) return C.primary;
  if (s.includes('untouched') || s.includes('enquiry') || s === 'new') return C.faint;
  return STATUS_FALLBACK[i % STATUS_FALLBACK.length];
}

function Tile({ children, tone }: { children: ReactNode; tone?: 'ok' | 'bad' }) {
  return (
    <Box
      sx={{
        border: `1px solid ${C.line}`,
        borderRadius: 3,
        px: 1.75,
        py: 1.5,
        display: 'grid',
        gap: 0.4,
        alignContent: 'start',
        bgcolor: 'background.paper',
        '& .tile-num': { ...monoSx, fontSize: '1.35rem', lineHeight: 1.1, fontWeight: 700, color: tone === 'ok' ? C.ok : tone === 'bad' ? C.bad : undefined },
      }}
    >
      {children}
    </Box>
  );
}

const tileTitle = { fontWeight: 700, fontSize: '0.84rem' };
const tileDesc = { fontSize: '0.75rem', color: 'text.secondary' };

function Band({ title, children, today }: { title: string; children: ReactNode; today?: boolean }) {
  return (
    <Box sx={{ display: 'grid', gap: 1.25, p: 1.75, borderRadius: 3, bgcolor: today ? C.sunk : C.primarySoft }}>
      <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary' }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

const tilesGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 1.25 };

export default function SpocScorecard({
  report,
  period,
  isAdmin,
  preferredKey,
  openDrawer,
}: {
  report: SpocReport;
  period: string;
  isAdmin: boolean;
  /** Row to show by default (e.g. the SPOC chosen in the controls). */
  preferredKey?: string;
  openDrawer: (c: DrawerContent) => void;
}) {
  const rows = report.rows;
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    setSelected((cur) => {
      if (preferredKey && rows.some((r) => rowKey(r) === preferredKey)) return preferredKey;
      if (cur && rows.some((r) => rowKey(r) === cur)) return cur;
      return rows[0] ? rowKey(rows[0]) : '';
    });
  }, [rows, preferredKey]);

  const row: SpocReportRow | undefined = useMemo(
    () => rows.find((r) => rowKey(r) === selected) || rows[0],
    [rows, selected]
  );

  const header = (
    <>
      SPOC Scorecard{row ? ` · ${row.name}` : ''}
    </>
  );
  const picker =
    isAdmin && rows.length > 1 ? (
      <TextField
        select
        size="small"
        value={row ? rowKey(row) : ''}
        onChange={(e) => setSelected(e.target.value)}
        inputProps={{ 'aria-label': 'Scorecard SPOC' }}
        sx={{ minWidth: 200 }}
      >
        {rows.map((r) => (
          <MenuItem key={rowKey(r)} value={rowKey(r)}>
            {r.name}
          </MenuItem>
        ))}
      </TextField>
    ) : undefined;

  if (!row) {
    return (
      <SectionCard title={header} action={picker} subtitle="One SPOC's work in the chosen dates, told as a story. Every number opens the list behind it.">
        <Typography variant="body2" color="text.secondary">
          Nothing to show for these dates.
        </Typography>
      </SectionCard>
    );
  }

  const bucketDrawer = (k: SpocBucket, title: string, f?: 'acted' | 'not') => {
    const items = filterItems(row.items, k, f);
    const suffix = f === 'acted' ? ' · acted on' : f === 'not' ? ' · not acted on' : '';
    openDrawer({
      kind: 'items',
      title: `${row.name} · ${title}${suffix} (${items.length})`,
      sub: `${period} · Click a record ID to open the lead or enrollment.`,
      items,
    });
  };

  const bucketTile = (k: SpocBucket, title: string, sub: string) => {
    const [n, a] = row.split[k] || [0, 0];
    const notA = n - a;
    const pending = k === 'over' || k === 'enrOver';
    return (
      <Tile>
        <Box component="span" sx={tileTitle}>{title}</Box>
        <Box>
          <NumButton big value={n} label={title} onClick={() => bucketDrawer(k, title)} />
        </Box>
        <Box component="span" sx={tileDesc}>{sub}</Box>
        {n > 0 && (
          <>
            <Box sx={{ mt: 0.75 }}>
              <SplitBar acted={a} total={n} width="100%" height={12} />
            </Box>
            <Box component="span" sx={tileDesc}>
              <NumButton value={a} tone="ok" label="acted on" onClick={() => bucketDrawer(k, title, 'acted')} /> acted on ·{' '}
              <NumButton value={notA} tone="bad" label={pending ? 'still pending' : 'not acted on'} onClick={() => bucketDrawer(k, title, 'not')} />{' '}
              {pending ? 'still pending' : 'not acted on'}
            </Box>
          </>
        )}
      </Tile>
    );
  };

  const statuses = Object.entries(row.new_status || {}).filter(([, v]) => v > 0);
  const statusTotal = statuses.reduce((t, [, v]) => t + v, 0);
  const care = row.care;
  const res = row.results;
  const reasons = Object.entries(res.closed_reasons || {});

  return (
    <SectionCard title={header} action={picker} subtitle="One SPOC's work in the chosen dates, told as a story. Every number opens the list behind it.">
      <Typography sx={{ fontSize: '0.95rem', maxWidth: '75ch' }}>
        In <b>{period}</b>, <b>{row.name}</b> had <b>{row.counts.total}</b> things to act on and acted on{' '}
        <Box component="b" sx={{ color: C.ok }}>{row.counts.acted}</Box>.{' '}
        <Box component="b" sx={{ color: C.bad }}>{row.counts.not}</Box> are still waiting.
      </Typography>

      <Band title="1 · Leads">
        <Box sx={tilesGrid}>
          {bucketTile('newL', 'New leads assigned', 'Given to them in these dates')}
          {bucketTile('due', 'Follow-ups due', 'Follow-up date falls in these dates')}
          {bucketTile('over', 'Overdue follow-ups', 'Date passed before these dates, still no action')}
        </Box>
        {row.counts.newL > 0 && statusTotal > 0 && (
          <Box sx={{ display: 'grid', gap: 0.75 }}>
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              Where the {row.counts.newL} new leads stand now
            </Typography>
            <Box sx={{ display: 'flex', height: 12, borderRadius: 99, overflow: 'hidden', bgcolor: C.line }}>
              {statuses.map(([s, v], i) => (
                <Box key={s} title={`${s}: ${v}`} sx={{ width: `${(v / statusTotal) * 100}%`, bgcolor: statusColor(s, i) }} />
              ))}
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: '0.78rem', color: 'text.secondary' }}>
              {statuses.map(([s, v], i) => (
                <Box key={s} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6 }}>
                  <Box component="span" sx={{ width: 9, height: 9, borderRadius: '2px', bgcolor: statusColor(s, i) }} />
                  {s} {v}
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Band>

      <Band title="2 · Enrollments">
        <Box sx={tilesGrid}>
          {bucketTile('enrDue', 'Customers due', 'Next Follow-up Due or a care step in these dates')}
          {bucketTile('enrOver', 'Customers overdue', 'Follow-up or care step date passed, still no action')}
          <Tile>
            <Box component="span" sx={tileTitle}>Care steps in these dates</Box>
            <span className="tile-num">{care.planned}</span>
            <Box component="span" sx={tileDesc}>
              <Box component="b" sx={{ color: C.ok }}>{care.done}</Box> done · {care.rescheduled} rescheduled · {care.skipped} skipped ·{' '}
              <Box component="b" sx={{ color: C.bad }}>{care.pending}</Box> pending
            </Box>
            <Box component="span" sx={tileDesc}>
              {care.overdue_before} more steps overdue from before · {care.done_ahead} done ahead of schedule
            </Box>
          </Tile>
        </Box>
      </Band>

      <Band title="3 · Results in these dates" today>
        <Box sx={tilesGrid}>
          <Tile tone="ok">
            <Box component="span" sx={tileTitle}>Enrolled</Box>
            <Box>
              <NumButton
                big
                tone="ok"
                value={res.enrolled}
                label="enrolled"
                onClick={() =>
                  openDrawer({
                    kind: 'results',
                    closed: false,
                    title: `${row.name} · Enrolled (${res.enrolled_list.length})`,
                    sub: `${period} · Click a Lead ID to open the lead.`,
                    list: res.enrolled_list,
                  })
                }
              />
            </Box>
            <Box component="span" sx={tileDesc}>Leads this SPOC marked Enrolled</Box>
          </Tile>
          <Tile tone="bad">
            <Box component="span" sx={tileTitle}>Closed (no sale)</Box>
            <Box>
              <NumButton
                big
                tone="bad"
                value={res.closed}
                label="closed"
                onClick={() =>
                  openDrawer({
                    kind: 'results',
                    closed: true,
                    title: `${row.name} · Closed (no sale) (${res.closed_list.length})`,
                    sub: `${period} · Click a Lead ID to open the lead.`,
                    list: res.closed_list,
                  })
                }
              />
            </Box>
            <Box component="span" sx={tileDesc}>
              {reasons.length ? reasons.map(([r, n]) => `${r} ${n}`).join(' · ') : 'None'}
            </Box>
          </Tile>
        </Box>
      </Band>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 18px', px: 1.75, py: 1, borderRadius: 2.5, border: `1px dashed ${C.line}`, fontSize: '0.8rem' }}>
        <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary' }}>
          As of today
        </Typography>
        <span>
          Leads owned now <Box component="b" sx={monoSx}>{row.portfolio.leads}</Box>
        </span>
        <span>
          Enrollments owned now <Box component="b" sx={monoSx}>{row.portfolio.enrollments}</Box>
        </span>
      </Box>

      {row.trend && row.trend.length > 1 && (
        <Box sx={{ display: 'grid', gap: 0.75 }}>
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            By day
          </Typography>
          <Box sx={{ display: 'grid', gap: 0.4 }}>
            {row.trend.map((t) => (
              <Box
                key={t.date}
                sx={{ display: 'grid', gridTemplateColumns: '90px 70px 90px 44px', alignItems: 'center', gap: 1, fontSize: '0.78rem' }}
              >
                <span>{formatToIST(t.date, 'EEE dd MMM')}</span>
                <Box component="span" sx={monoSx}>
                  {t.acted}/{t.total}
                </Box>
                {t.total > 0 ? <SplitBar acted={t.acted} total={t.total} width={90} /> : <span />}
                <Box component="span" sx={{ ...monoSx, color: 'text.secondary' }}>
                  {t.total ? `${pct(t.acted, t.total)}%` : '-'}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </SectionCard>
  );
}
