import { Box, Button, Drawer, Typography } from '@mui/material';
import { formatToIST } from '../../utils/dateUtils';
import type { SpocClosedEntry, SpocItem, SpocResultEntry } from '../../types/summary.types';
import { C, ItemList, RecordLink } from './shared';

export type DrawerContent =
  | { kind: 'items'; title: string; sub: string; items: SpocItem[] }
  | { kind: 'results'; title: string; sub: string; closed: boolean; list: Array<SpocResultEntry | SpocClosedEntry> };

function ResultList({ list, closed }: { list: Array<SpocResultEntry | SpocClosedEntry>; closed: boolean }) {
  if (!list.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        Nothing here.
      </Typography>
    );
  }
  const cols = { xs: '1fr', sm: closed ? 'minmax(0,1.6fr) minmax(0,1.4fr) minmax(0,1.2fr)' : 'minmax(0,1.6fr) minmax(0,1.2fr)' };
  return (
    <Box sx={{ border: `1px solid ${C.line}`, borderRadius: 2.5, overflow: 'hidden' }}>
      <Box
        sx={{
          display: { xs: 'none', sm: 'grid' },
          gridTemplateColumns: cols,
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
        {closed && <span>Reason</span>}
        <span>By · when</span>
      </Box>
      {list.map((r, i) => (
        <Box
          key={`${r.id}-${i}`}
          sx={{ display: 'grid', gridTemplateColumns: cols, gap: 1.25, px: 1.5, py: 1.1, borderTop: `1px solid ${C.line}`, alignItems: 'center', fontSize: '0.84rem' }}
        >
          <Box sx={{ minWidth: 0 }}>
            <RecordLink type="lead" id={r.id} />
            <div>{r.name}</div>
          </Box>
          {closed && (
            <Box sx={{ minWidth: 0 }}>
              <div>{(r as SpocClosedEntry).reason || '-'}</div>
              {(r as SpocClosedEntry).status && (
                <Typography variant="caption" color="text.secondary">
                  {(r as SpocClosedEntry).status}
                </Typography>
              )}
            </Box>
          )}
          <Typography variant="caption">
            <b>{r.by || 'Unknown'}</b>
            <Box component="span" sx={{ color: 'text.secondary' }}>
              {' '}· {formatToIST(r.at, 'dd MMM, hh:mm a')}
            </Box>
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

export default function RecordDrawer({ content, onClose }: { content: DrawerContent | null; onClose: () => void }) {
  return (
    <Drawer
      anchor="right"
      open={!!content}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 620 }, maxWidth: '100%' } }}
    >
      {content && (
        <Box role="dialog" aria-labelledby="summaries-drawer-title" sx={{ p: 2.25, display: 'grid', gap: 1.75, alignContent: 'start' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.25 }}>
            <Typography id="summaries-drawer-title" variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem' }}>
              {content.title}
            </Typography>
            <Button variant="outlined" size="small" onClick={onClose} sx={{ textTransform: 'none' }}>
              Close
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {content.sub}
          </Typography>
          {content.kind === 'items' ? (
            <ItemList items={content.items} />
          ) : (
            <ResultList list={content.list} closed={content.closed} />
          )}
        </Box>
      )}
    </Drawer>
  );
}
