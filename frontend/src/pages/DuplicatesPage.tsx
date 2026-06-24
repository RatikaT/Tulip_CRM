import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Divider,
  CircularProgress,
  Tabs,
  Tab,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RestoreIcon from '@mui/icons-material/Restore';
import { toast } from 'react-toastify';
import { leadService, DuplicateItem, DuplicatesSummary } from '../services/leadService';
import { Lead } from '../types/lead.types';
import { formatShortDateIST, formatDateTimeIST } from '../utils/dateUtils';
import { brandColors } from '../theme';

// Soft colored pill styles per lead status (matches LeadsPage design)
const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  'Enquiry Lead': { bg: 'rgba(30,64,136,0.10)', color: '#1E4088' },
  'Enrolled': { bg: 'rgba(16,185,129,0.12)', color: '#0f8a63' },
  'Follow up-In Process': { bg: 'rgba(245,158,11,0.14)', color: '#b26a00' },
  'Follow up-No Response': { bg: 'rgba(255,152,0,0.14)', color: '#c2410c' },
  'Not Interested': { bg: 'rgba(239,68,68,0.12)', color: '#dc2626' },
  'Lead Closed-No Response': { bg: 'rgba(100,116,139,0.12)', color: '#475569' },
  'Duplicate': { bg: 'rgba(123,75,148,0.12)', color: '#7B4B94' },
};

const getStatusChipSx = (status: string) => {
  const s = STATUS_STYLES[status] || { bg: 'rgba(100,116,139,0.10)', color: '#475569' };
  return {
    bgcolor: s.bg,
    color: s.color,
    fontWeight: 600,
    fontSize: '0.7rem',
    height: 24,
    borderRadius: '8px',
    border: `1px solid ${s.color}33`,
    '& .MuiChip-label': { px: 1 },
  };
};

const CARD_SHADOW = '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)';

interface DetailRowProps {
  label: string;
  value: React.ReactNode;
}

const DetailRow = ({ label, value }: DetailRowProps) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, py: 0.4 }}>
    <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 90 }}>
      {label}
    </Typography>
    <Box sx={{ textAlign: 'right', minWidth: 0 }}>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Typography variant="body2" sx={{ fontWeight: 500, wordBreak: 'break-word' }}>
          {value || '—'}
        </Typography>
      ) : (
        value
      )}
    </Box>
  </Box>
);

const LeadColumn = ({
  lead,
  label,
  accent,
  compact = false,
  footer,
}: {
  lead: Lead;
  label: string;
  accent: string;
  compact?: boolean;
  footer?: React.ReactNode;
}) => (
  <Box
    sx={{
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 2.5,
      p: 2,
      height: '100%',
      bgcolor: '#fff',
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: accent }} />
      <Typography
        variant="caption"
        sx={{ fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: accent }}
      >
        {label}
      </Typography>
    </Box>
    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
      {lead.name || '—'}
    </Typography>
    <Divider sx={{ my: 1 }} />
    <DetailRow label="Lead ID" value={lead.lead_id} />
    <DetailRow label="Phone" value={lead.phone_number} />
    <DetailRow label="UHID" value={lead.uhid || '—'} />
    {!compact && (
      <>
        <DetailRow label="Service" value={lead.service_requested || '—'} />
        <DetailRow label="Source" value={lead.lead_source || '—'} />
      </>
    )}
    <DetailRow label="Created" value={formatShortDateIST(lead.created_at)} />
    {!compact && <DetailRow label="Assigned To" value={lead.assigned_to_name || '—'} />}
    <DetailRow
      label="Status"
      value={<Chip label={lead.status} size="small" sx={getStatusChipSx(lead.status)} />}
    />
    {footer && <Box sx={{ mt: 'auto', pt: 1.5 }}>{footer}</Box>}
  </Box>
);

const MatchedOnChips = ({ matched }: { matched: string[] }) =>
  matched && matched.length > 0 ? (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
        Matched on:
      </Typography>
      {matched.map((m) => (
        <Chip
          key={m}
          label={m}
          size="small"
          sx={{
            bgcolor: 'rgba(245,158,11,0.14)',
            color: '#b26a00',
            fontWeight: 600,
            fontSize: '0.68rem',
            height: 22,
            borderRadius: '6px',
            border: '1px solid rgba(245,158,11,0.30)',
            '& .MuiChip-label': { px: 0.9 },
          }}
        />
      ))}
    </Box>
  ) : null;

interface SummaryTileProps {
  emoji: string;
  count: number;
  label: string;
  bg: string;
  color: string;
}

const SummaryTile = ({ emoji, count, label, bg, color }: SummaryTileProps) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 1.25,
      px: 2,
      py: 1.25,
      borderRadius: 2.5,
      border: '1px solid',
      borderColor: `${color}33`,
      bgcolor: bg,
      minWidth: 160,
      flex: { xs: '1 1 100%', sm: '0 1 auto' },
    }}
  >
    <Typography sx={{ fontSize: '1.3rem', lineHeight: 1 }}>{emoji}</Typography>
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 800, color, lineHeight: 1.1 }}>
        {count}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
        {label}
      </Typography>
    </Box>
  </Box>
);

export default function DuplicatesPage() {
  const [tab, setTab] = useState(0); // 0 = needs review (pending), 1 = confirmed
  const [items, setItems] = useState<DuplicateItem[]>([]);
  const [summary, setSummary] = useState<DuplicatesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const state = tab === 0 ? 'pending' : 'confirmed';

  const loadSummary = useCallback(async () => {
    try {
      const data = await leadService.getDuplicatesSummary();
      setSummary(data);
    } catch (error) {
      console.error('Failed to load duplicates summary:', error);
    }
  }, []);

  const loadDuplicates = useCallback(async (which: 'pending' | 'confirmed') => {
    setLoading(true);
    try {
      const data = await leadService.getDuplicates(which);
      setItems(data.duplicates || []);
    } catch (error) {
      console.error('Failed to load duplicates:', error);
      toast.error('Failed to load duplicate leads');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial mount: auto-scan (affects pending only) then load summary + current tab.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await leadService.scanDuplicates();
      } catch (error) {
        // ignore scan errors (e.g. server cold start); still load what's flagged
        console.error('Auto-scan on open failed:', error);
      }
      if (cancelled) return;
      await Promise.all([loadSummary(), loadDuplicates('pending')]);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload list when tab changes.
  useEffect(() => {
    loadDuplicates(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const result = await leadService.scanDuplicates();
      toast.success(result.message || `Scan complete — ${result.flagged} flagged`);
      await Promise.all([loadSummary(), loadDuplicates(state)]);
    } catch (error) {
      console.error('Duplicate scan failed:', error);
      toast.error('Failed to scan for duplicates');
    } finally {
      setScanning(false);
    }
  };

  const handleKeep = async (item: DuplicateItem, keepLead: Lead, removeLead: Lead) => {
    const key = item.lead.lead_id;
    setPending((p) => ({ ...p, [key]: true }));
    try {
      const result = await leadService.resolveDuplicate(keepLead.lead_id, removeLead.lead_id);
      toast.success(result.message || `Kept ${keepLead.name || keepLead.lead_id}`);
      setItems((prev) => prev.filter((i) => i.lead.lead_id !== key));
      await loadSummary();
    } catch (error) {
      console.error('Failed to resolve duplicate:', error);
      toast.error('Failed to resolve duplicate');
    } finally {
      setPending((p) => ({ ...p, [key]: false }));
    }
  };

  const handleDismiss = async (item: DuplicateItem) => {
    const key = item.lead.lead_id;
    setPending((p) => ({ ...p, [key]: true }));
    try {
      const result = await leadService.dismissDuplicate(key);
      toast.success(result.message || 'Moved to Leads');
      setItems((prev) => prev.filter((i) => i.lead.lead_id !== key));
      await loadSummary();
    } catch (error) {
      console.error('Failed to dismiss duplicate:', error);
      toast.error('Failed to move lead to Leads');
    } finally {
      setPending((p) => ({ ...p, [key]: false }));
    }
  };

  const handleRestore = async (item: DuplicateItem) => {
    const key = item.lead.lead_id;
    setPending((p) => ({ ...p, [key]: true }));
    try {
      const result = await leadService.restoreDuplicate(key);
      toast.success(result.message || 'Restored to Leads');
      setItems((prev) => prev.filter((i) => i.lead.lead_id !== key));
      await loadSummary();
    } catch (error) {
      console.error('Failed to restore duplicate:', error);
      toast.error('Failed to restore lead');
    } finally {
      setPending((p) => ({ ...p, [key]: false }));
    }
  };

  const renderNeedsReview = () => {
    if (items.length === 0) {
      return (
        <Card sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: CARD_SHADOW }}>
          <CardContent sx={{ py: 8, textAlign: 'center' }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
              No duplicate leads to review 🎉
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Run a scan to check for new possible duplicates.
            </Typography>
          </CardContent>
        </Card>
      );
    }

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {items.map((item) => {
          const key = item.lead.lead_id;
          const isBusy = !!pending[key];
          const keepBtn = (keepLead: Lead, removeLead: Lead | null) => (
            <Button
              fullWidth
              variant="contained"
              color="success"
              startIcon={<CheckCircleIcon />}
              disabled={isBusy || !removeLead}
              onClick={() => removeLead && handleKeep(item, keepLead, removeLead)}
              sx={{ mt: 0.5 }}
            >
              Keep this one
            </Button>
          );
          return (
            <Card key={key} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: CARD_SHADOW }}>
              <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                <MatchedOnChips matched={item.matched_on} />

                <Grid container spacing={2} alignItems="stretch">
                  <Grid item xs={12} md={6}>
                    <LeadColumn
                      lead={item.lead}
                      label="Possible duplicate"
                      accent="#dc2626"
                      footer={keepBtn(item.lead, item.primary)}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    {item.primary ? (
                      <LeadColumn
                        lead={item.primary}
                        label="Original"
                        accent="#0f8a63"
                        footer={keepBtn(item.primary, item.lead)}
                      />
                    ) : (
                      <Box
                        sx={{
                          border: '1px dashed',
                          borderColor: 'divider',
                          borderRadius: 2.5,
                          p: 2,
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Typography variant="body2" color="text.secondary">
                          No original lead linked
                        </Typography>
                      </Box>
                    )}
                  </Grid>
                </Grid>

                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                  <Button variant="text" color="inherit" disabled={isBusy} onClick={() => handleDismiss(item)}>
                    Not a duplicate
                  </Button>
                </Box>
              </CardContent>
            </Card>
          );
        })}
      </Box>
    );
  };

  const renderConfirmed = () => {
    if (items.length === 0) {
      return (
        <Card sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: CARD_SHADOW }}>
          <CardContent sx={{ py: 8, textAlign: 'center' }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              No confirmed duplicates yet.
            </Typography>
          </CardContent>
        </Card>
      );
    }

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {items.map((item) => {
          const key = item.lead.lead_id;
          const isBusy = !!pending[key];
          const resolvedAt = item.lead.duplicate_resolved_at;
          return (
            <Card key={key} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: CARD_SHADOW }}>
              <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                <MatchedOnChips matched={item.matched_on} />

                <Grid container spacing={2} alignItems="stretch">
                  <Grid item xs={12} md={7}>
                    <LeadColumn lead={item.lead} label="Confirmed duplicate" accent="#7B4B94" />
                  </Grid>
                  <Grid item xs={12} md={5}>
                    {item.primary ? (
                      <LeadColumn lead={item.primary} label="Kept lead" accent="#0f8a63" compact />
                    ) : (
                      <Box
                        sx={{
                          border: '1px dashed',
                          borderColor: 'divider',
                          borderRadius: 2.5,
                          p: 2,
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Typography variant="body2" color="text.secondary">
                          No kept lead linked
                        </Typography>
                      </Box>
                    )}
                  </Grid>
                </Grid>

                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    justifyContent: 'space-between',
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    gap: 1.5,
                    mt: 2,
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    Confirmed by {item.resolved_by_name || 'Unknown'}
                    {resolvedAt ? ` · ${formatDateTimeIST(resolvedAt)}` : ''}
                  </Typography>
                  <Button
                    variant="outlined"
                    startIcon={<RestoreIcon />}
                    disabled={isBusy}
                    onClick={() => handleRestore(item)}
                  >
                    Restore to Leads
                  </Button>
                </Box>
              </CardContent>
            </Card>
          );
        })}
      </Box>
    );
  };

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 1.5,
          mb: 2.5,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Duplicate Leads
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Review and resolve possible duplicate leads
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={scanning ? <CircularProgress size={16} color="inherit" /> : <ContentCopyIcon />}
          onClick={handleScan}
          disabled={scanning}
        >
          {scanning ? 'Scanning...' : 'Scan for duplicates'}
        </Button>
      </Box>

      {/* Summary tiles */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2.5 }}>
        <SummaryTile
          emoji="🟢"
          count={summary?.active_leads ?? 0}
          label="real leads"
          bg="rgba(16,185,129,0.08)"
          color="#0f8a63"
        />
        <SummaryTile
          emoji="🟡"
          count={summary?.pending ?? 0}
          label="to review"
          bg="rgba(245,158,11,0.10)"
          color="#b26a00"
        />
        <SummaryTile
          emoji="🔴"
          count={summary?.confirmed ?? 0}
          label="confirmed duplicates"
          bg="rgba(239,68,68,0.08)"
          color="#dc2626"
        />
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', mb: 2.5 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            '& .MuiTab-root': { textTransform: 'none', fontWeight: 600 },
            '& .Mui-selected': { color: brandColors.navyBlue },
            '& .MuiTabs-indicator': { backgroundColor: brandColors.navyBlue },
          }}
        >
          <Tab label={`Needs review (${summary?.pending ?? 0})`} />
          <Tab label={`Confirmed duplicates (${summary?.confirmed ?? 0})`} />
        </Tabs>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 }}>
          <CircularProgress />
        </Box>
      ) : tab === 0 ? (
        renderNeedsReview()
      ) : (
        renderConfirmed()
      )}
    </Box>
  );
}
