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
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { toast } from 'react-toastify';
import { leadService, DuplicateItem } from '../services/leadService';
import { Lead } from '../types/lead.types';
import { formatShortDateIST } from '../utils/dateUtils';

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
}: {
  lead: Lead;
  label: string;
  accent: string;
}) => (
  <Box
    sx={{
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 2.5,
      p: 2,
      height: '100%',
      bgcolor: '#fff',
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
    <DetailRow label="Service" value={lead.service_requested || '—'} />
    <DetailRow label="Source" value={lead.lead_source || '—'} />
    <DetailRow label="Created" value={formatShortDateIST(lead.created_at)} />
    <DetailRow label="Assigned To" value={lead.assigned_to_name || '—'} />
    <DetailRow
      label="Status"
      value={<Chip label={lead.status} size="small" sx={getStatusChipSx(lead.status)} />}
    />
  </Box>
);

export default function DuplicatesPage() {
  const [items, setItems] = useState<DuplicateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const loadDuplicates = useCallback(async () => {
    setLoading(true);
    try {
      const data = await leadService.getDuplicates();
      setItems(data.duplicates || []);
    } catch (error) {
      console.error('Failed to load duplicates:', error);
      toast.error('Failed to load duplicate leads');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // On open, run a fresh scan first so the list is never stale (covers the
    // case where the upload-time scan lagged on a slow server), then load.
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await leadService.scanDuplicates();
      } catch (error) {
        // ignore scan errors (e.g. server cold start); still load what's flagged
        console.error('Auto-scan on open failed:', error);
      }
      if (!cancelled) await loadDuplicates();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadDuplicates]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const result = await leadService.scanDuplicates();
      toast.success(result.message || `Scan complete — ${result.flagged} flagged`);
      await loadDuplicates();
    } catch (error) {
      console.error('Duplicate scan failed:', error);
      toast.error('Failed to scan for duplicates');
    } finally {
      setScanning(false);
    }
  };

  const handleConfirm = async (leadId: string) => {
    setPending((p) => ({ ...p, [leadId]: true }));
    try {
      const result = await leadService.confirmDuplicate(leadId);
      toast.success(result.message || 'Marked as duplicate');
      setItems((prev) => prev.filter((i) => i.lead.lead_id !== leadId));
    } catch (error) {
      console.error('Failed to confirm duplicate:', error);
      toast.error('Failed to confirm duplicate');
    } finally {
      setPending((p) => ({ ...p, [leadId]: false }));
    }
  };

  const handleDismiss = async (leadId: string) => {
    setPending((p) => ({ ...p, [leadId]: true }));
    try {
      const result = await leadService.dismissDuplicate(leadId);
      toast.success(result.message || 'Moved to Leads');
      setItems((prev) => prev.filter((i) => i.lead.lead_id !== leadId));
    } catch (error) {
      console.error('Failed to dismiss duplicate:', error);
      toast.error('Failed to move lead to Leads');
    } finally {
      setPending((p) => ({ ...p, [leadId]: false }));
    }
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
          mb: 3,
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

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 }}>
          <CircularProgress />
        </Box>
      ) : items.length === 0 ? (
        <Card
          sx={{
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: CARD_SHADOW,
          }}
        >
          <CardContent sx={{ py: 8, textAlign: 'center' }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
              No duplicate leads to review 🎉
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Run a scan to check for new possible duplicates.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {items.map((item) => {
            const leadId = item.lead.lead_id;
            const isBusy = !!pending[leadId];
            return (
              <Card
                key={leadId}
                sx={{
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: 'divider',
                  boxShadow: CARD_SHADOW,
                }}
              >
                <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                  {/* Matched-on chips */}
                  {item.matched_on && item.matched_on.length > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                        Matched on:
                      </Typography>
                      {item.matched_on.map((m) => (
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
                  )}

                  {/* Side-by-side leads */}
                  <Grid container spacing={2} alignItems="stretch">
                    <Grid item xs={12} md={6}>
                      <LeadColumn lead={item.lead} label="Possible duplicate" accent="#dc2626" />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      {item.primary ? (
                        <LeadColumn lead={item.primary} label="Original (kept)" accent="#0f8a63" />
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

                  {/* Actions */}
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: 1.5,
                      mt: 2.5,
                    }}
                  >
                    <Button
                      variant="outlined"
                      color="error"
                      onClick={() => handleConfirm(leadId)}
                      disabled={isBusy}
                    >
                      Confirm Duplicate
                    </Button>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={() => handleDismiss(leadId)}
                      disabled={isBusy}
                    >
                      Move to Leads
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
