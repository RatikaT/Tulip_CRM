import { Fragment, ReactNode } from 'react';
import { Box, Chip, Link, Paper, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { formatToIST } from '../../utils/dateUtils';
import type { SpocBucket, SpocCountKey, SpocItem, SpocReportRow } from '../../types/summary.types';

/** Palette shared by the Summaries page (matches the approved mockup). */
export const C = {
  primary: '#1E4088',
  primarySoft: '#e6ecf8',
  ok: '#137a4b',
  okSoft: '#e2f4ea',
  warn: '#a15c00',
  warnSoft: '#fdf0da',
  bad: '#c0352b',
  badSoft: '#fbe6e4',
  purple: '#6b3f8a',
  purpleSoft: '#f1e8f7',
  sunk: '#f5f7fb',
  line: '#e0e0e0',
  faint: '#8a93a6',
};

export const cardSx = {
  borderRadius: 3,
  border: '1px solid',
  borderColor: 'divider',
  boxShadow: '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)',
  overflow: 'hidden',
};

export const monoSx = { fontFamily: '"Roboto Mono", ui-monospace, Menlo, monospace', fontVariantNumeric: 'tabular-nums' };

export const LABEL: Record<SpocCountKey, string> = {
  newL: 'New leads assigned',
  due: 'Leads due for follow-up',
  over: 'Leads overdue',
  enrDue: 'Enrollments due',
  enrOver: 'Enrollments overdue',
  total: 'Total actionable',
  acted: 'Acted on',
  not: 'Not acted on',
};

export const BUCKETS: SpocBucket[] = ['newL', 'due', 'over', 'enrDue', 'enrOver'];

/** "29 Sep 2026" or "23 Sep 2026 to 29 Sep 2026" */
export function periodLabel(start: string, end: string): string {
  const f = formatToIST(start, 'dd MMM yyyy');
  return start === end ? f : `${f} to ${formatToIST(end, 'dd MMM yyyy')}`;
}

/** Stable key for a report row (user_id can be null for name-only rows). */
export const rowKey = (r: SpocReportRow) => r.user_id ?? `name:${r.name}`;

export function pct(part: number, whole: number): number {
  return whole ? Math.round((part / whole) * 100) : 0;
}

/** Pull a readable message out of an axios error (FastAPI puts it in `detail`). */
export function errorDetail(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' && detail.trim() ? detail : fallback;
}

/** Filter a SPOC's items for a table column / scorecard link. */
export function filterItems(items: SpocItem[], key: SpocCountKey, acted?: 'acted' | 'not'): SpocItem[] {
  let out = BUCKETS.includes(key as SpocBucket) ? items.filter((i) => i.bucket === key) : items;
  const f = acted || (key === 'acted' || key === 'not' ? key : undefined);
  if (f === 'acted') out = out.filter((i) => i.acted);
  if (f === 'not') out = out.filter((i) => !i.acted);
  return out;
}

/** A count that opens the list behind it. Zero is plain faint text. */
export function NumButton({
  value,
  tone,
  onClick,
  label,
  big,
}: {
  value: number;
  tone?: 'ok' | 'bad';
  onClick: () => void;
  label?: string;
  big?: boolean;
}) {
  const size = big ? '1.35rem' : '0.875rem';
  if (!value) {
    return (
      <Box component="span" sx={{ ...monoSx, color: C.faint, fontWeight: 700, px: 0.75, fontSize: size }}>
        0
      </Box>
    );
  }
  const color = tone === 'ok' ? C.ok : tone === 'bad' ? C.bad : C.primary;
  return (
    <Box
      component="button"
      type="button"
      aria-label={label ? `${value} ${label} - show list` : undefined}
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
      sx={{
        ...monoSx,
        background: 'none',
        border: 0,
        cursor: 'pointer',
        color,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1.2,
        px: 0.75,
        py: 0.25,
        borderRadius: 1.5,
        textDecoration: 'underline',
        textDecorationColor: 'transparent',
        '&:hover': { textDecorationColor: 'currentColor', bgcolor: C.primarySoft },
        '&:focus-visible': { outline: `2px solid ${C.primary}`, outlineOffset: 2 },
      }}
    >
      {value}
    </Box>
  );
}

/** Green (acted) / red (not) split bar. */
export function SplitBar({ acted, total, width = 70, height = 8 }: { acted: number; total: number; width?: number | string; height?: number }) {
  const p = pct(acted, total);
  return (
    <Box
      component="span"
      title={`${p}% acted on`}
      role="img"
      aria-label={`${p}% acted on`}
      sx={{ display: 'inline-flex', width, height, borderRadius: 99, overflow: 'hidden', bgcolor: C.badSoft, verticalAlign: 'middle' }}
    >
      <Box component="span" sx={{ width: `${p}%`, bgcolor: C.ok }} />
    </Box>
  );
}

const chipBase = { height: 20, fontSize: '0.7rem', fontWeight: 700, borderRadius: 99, '& .MuiChip-label': { px: 1 } };

export function ToneChip({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return <Chip size="small" label={label} sx={{ ...chipBase, color: fg, bgcolor: bg }} />;
}

export function BucketChip({ bucket }: { bucket: SpocBucket | '' }) {
  if (bucket === 'newL') return <ToneChip label="New" fg={C.primary} bg={C.primarySoft} />;
  if (bucket === 'due' || bucket === 'enrDue') return <ToneChip label="Due" fg={C.warn} bg={C.warnSoft} />;
  if (bucket === 'over' || bucket === 'enrOver') return <ToneChip label="Overdue" fg={C.bad} bg={C.badSoft} />;
  return <ToneChip label="Extra" fg={C.ok} bg={C.okSoft} />;
}

/** Record ID that opens the lead or enrollment page. */
export function RecordLink({ type, id }: { type: 'lead' | 'enrollment'; id: string }) {
  const navigate = useNavigate();
  return (
    <Link
      component="button"
      type="button"
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        navigate(type === 'enrollment' ? `/tulip/enrollments/${id}` : `/tulip/leads/${id}`);
      }}
      sx={{ ...monoSx, fontSize: '0.75rem', fontWeight: 600, textAlign: 'left' }}
    >
      {id}
    </Link>
  );
}

function Actions({ item }: { item: SpocItem }) {
  if (!item.acted && item.bucket !== '') return <ToneChip label="Not acted on" fg={C.bad} bg={C.badSoft} />;
  return (
    <Box sx={{ display: 'grid', gap: 0.5 }}>
      {item.bucket !== '' && (
        <Box>
          <ToneChip label="Acted on" fg={C.ok} bg={C.okSoft} />
        </Box>
      )}
      {item.actions.map((a, i) => (
        <Typography key={i} variant="caption" sx={{ display: 'block', lineHeight: 1.4 }}>
          {a.what} · <b>{a.by || 'Unknown'}</b>
          <Box component="span" sx={{ color: 'text.secondary' }}>
            {' '}· {formatToIST(a.at, 'dd MMM, hh:mm a')}
          </Box>
        </Typography>
      ))}
    </Box>
  );
}

const gridCols = { xs: '1fr', sm: 'minmax(0,1.5fr) minmax(0,1.3fr) minmax(0,1.8fr)' };

/** The "Lead / customer · Why · What was done" list used in drawers and expanded rows. */
export function ItemList({ items, empty = 'Nothing here.' }: { items: SpocItem[]; empty?: string }) {
  if (!items.length) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
        {empty}
      </Typography>
    );
  }
  return (
    <Box sx={{ border: `1px solid ${C.line}`, borderRadius: 2.5, overflow: 'hidden' }}>
      <Box
        sx={{
          display: { xs: 'none', sm: 'grid' },
          gridTemplateColumns: gridCols,
          gap: 1.25,
          px: 1.5,
          py: 1,
          bgcolor: C.sunk,
          fontSize: '0.75rem',
          fontWeight: 700,
          color: 'text.secondary',
        }}
      >
        <span>Lead / customer</span>
        <span>Why it was on the list</span>
        <span>What was done</span>
      </Box>
      {items.map((it, idx) => (
        <Box
          key={`${it.type}-${it.id}-${idx}`}
          sx={{
            display: 'grid',
            gridTemplateColumns: gridCols,
            gap: 1.25,
            px: 1.5,
            py: 1.1,
            borderTop: `1px solid ${C.line}`,
            alignItems: 'center',
            fontSize: '0.84rem',
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <RecordLink type={it.type} id={it.id} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
              <span>{it.name}</span>
              {it.type === 'enrollment' && <ToneChip label="Enrollment" fg={C.purple} bg={C.purpleSoft} />}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', minWidth: 0 }}>
            <BucketChip bucket={it.bucket} />
            {it.why && (
              <Typography variant="caption" color="text.secondary">
                {it.why}
              </Typography>
            )}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Actions item={it} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/** Render `**bold**` segments as <strong> without injecting HTML. */
function inlineBold(text: string): ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : <Fragment key={i}>{p.replace(/\*/g, '')}</Fragment>));
}

/** AI note as bullets: one line per bullet, leading "*", "-", "•" stripped. */
export function NoteBullets({ note }: { note: string }) {
  const lines = note
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^([*\-•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean);
  if (!lines.length) return null;
  return (
    <Box component="ul" sx={{ m: 0, pl: 2.25, display: 'grid', gap: 0.5 }}>
      {lines.map((l, i) => (
        <Typography component="li" variant="body2" key={i}>
          {inlineBold(l)}
        </Typography>
      ))}
    </Box>
  );
}

/** Card with a header (title row + subtitle) and a body, like the mockup's .card. */
export function SectionCard({
  title,
  action,
  subtitle,
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Paper elevation={0} sx={{ ...cardSx, mb: 3 }}>
      <Box sx={{ px: 2.25, py: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'grid', gap: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.25, flexWrap: 'wrap' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem' }}>
            {title}
          </Typography>
          {action}
        </Box>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      <Box sx={{ px: 2.25, py: 2, display: 'grid', gap: 1.75 }}>{children}</Box>
    </Paper>
  );
}
