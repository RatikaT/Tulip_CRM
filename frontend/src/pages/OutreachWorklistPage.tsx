import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Tabs,
  Tab,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Tooltip,
  IconButton,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CampaignIcon from '@mui/icons-material/Campaign';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { journeyService } from '../services/journeyService';
import { OutreachWorklistItem } from '../types/journey.types';
import { formatShortDateIST } from '../utils/dateUtils';
import { useAuthStore } from '../stores/authStore';
import { brandColors } from '../theme';

const CARD_SHADOW = '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)';

// Soft colored pill styles per lead status (matches DuplicatesPage / LeadsPage design)
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

export default function OutreachWorklistPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [tab, setTab] = useState(0); // 0 = all pending, 1 = overdue
  const [items, setItems] = useState<OutreachWorklistItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const overdue = tab === 1;

  const load = useCallback(async (overdueOnly: boolean) => {
    setLoading(true);
    try {
      const data = await journeyService.outreachWorklist(overdueOnly);
      setItems(data.items || []);
      setTotal(data.total ?? (data.items?.length || 0));
    } catch (error) {
      console.error('Failed to load outreach worklist:', error);
      toast.error('Failed to load outreach worklist');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    load(overdue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const rowKey = (item: OutreachWorklistItem) => `${item.lead_id}:${item.step_id}`;

  const handleUpdateStep = async (
    item: OutreachWorklistItem,
    status: 'done' | 'skipped'
  ) => {
    const key = rowKey(item);
    setPending((p) => ({ ...p, [key]: true }));
    try {
      await journeyService.updateLeadStep(item.lead_id, item.step_id, { status });
      toast.success(status === 'done' ? 'Touchpoint marked done' : 'Touchpoint skipped');
      await load(overdue);
    } catch (error) {
      console.error('Failed to update touchpoint:', error);
      toast.error('Failed to update touchpoint');
    } finally {
      setPending((p) => ({ ...p, [key]: false }));
    }
  };

  if (!isAdmin) {
    return (
      <Box>
        <Card sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: CARD_SHADOW }}>
          <CardContent sx={{ py: 8, textAlign: 'center' }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
              Admins only
            </Typography>
            <Typography variant="body2" color="text.secondary">
              You don't have permission to view the outreach worklist.
            </Typography>
          </CardContent>
        </Card>
      </Box>
    );
  }

  const renderEmpty = () => (
    <Card sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: CARD_SHADOW }}>
      <CardContent sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
          {overdue ? 'No overdue touchpoints 🎉' : 'No outreach touchpoints pending 🎉'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {overdue
            ? 'Every scheduled outreach touchpoint is on track.'
            : "You're all caught up across closed leads."}
        </Typography>
      </CardContent>
    </Card>
  );

  const renderTable = () => (
    <TableContainer
      component={Card}
      sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: CARD_SHADOW }}
    >
      <Table size="small">
        <TableHead>
          <TableRow sx={{ '& th': { fontWeight: 700, color: 'text.secondary', bgcolor: 'rgba(30,64,136,0.04)' } }}>
            <TableCell>Lead</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Service</TableCell>
            <TableCell>Touchpoint</TableCell>
            <TableCell>Planned date</TableCell>
            <TableCell>Assigned agent</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => {
            const key = rowKey(item);
            const isBusy = !!pending[key];
            return (
              <TableRow key={key} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {item.lead_name || '—'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {item.phone_number || '—'}
                  </Typography>
                </TableCell>
                <TableCell>
                  {item.status ? (
                    <Chip label={item.status} size="small" sx={getStatusChipSx(item.status)} />
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{item.service_requested || '—'}</Typography>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {item.step_name || '—'}
                    </Typography>
                    {item.step_type && (
                      <Chip
                        label={item.step_type}
                        size="small"
                        sx={{
                          bgcolor: 'rgba(30,64,136,0.08)',
                          color: brandColors.navyBlue,
                          fontWeight: 600,
                          fontSize: '0.65rem',
                          height: 20,
                          borderRadius: '6px',
                          '& .MuiChip-label': { px: 0.75 },
                        }}
                      />
                    )}
                    {item.is_optional && (
                      <Chip
                        label="Optional"
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: '0.6rem', height: 18, '& .MuiChip-label': { px: 0.6 } }}
                      />
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: item.is_overdue ? 700 : 500,
                        color: item.is_overdue ? 'error.main' : 'text.primary',
                      }}
                    >
                      {formatShortDateIST(item.planned_date)}
                    </Typography>
                    {item.is_overdue && (
                      <Chip
                        label="Overdue"
                        size="small"
                        color="error"
                        sx={{ fontSize: '0.6rem', height: 18, fontWeight: 700, '& .MuiChip-label': { px: 0.6 } }}
                      />
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{item.assigned_to_name || '—'}</Typography>
                </TableCell>
                <TableCell align="right">
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.25 }}>
                    <Tooltip title="Mark done">
                      <span>
                        <IconButton
                          size="small"
                          color="success"
                          disabled={isBusy}
                          onClick={() => handleUpdateStep(item, 'done')}
                        >
                          <CheckCircleIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Skip">
                      <span>
                        <IconButton
                          size="small"
                          color="warning"
                          disabled={isBusy}
                          onClick={() => handleUpdateStep(item, 'skipped')}
                        >
                          <SkipNextIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Open lead">
                      <IconButton
                        size="small"
                        onClick={() => navigate(`/tulip/leads/${item.lead_id}`)}
                      >
                        <OpenInNewIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );

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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <CampaignIcon sx={{ color: brandColors.navyBlue }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Outreach
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {loading ? 'Loading touchpoints…' : `${total} touchpoint${total === 1 ? '' : 's'} across closed leads`}
            </Typography>
          </Box>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => load(overdue)}
          disabled={loading}
        >
          Refresh
        </Button>
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
          <Tab label="All pending" />
          <Tab label="Overdue" />
        </Tabs>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 }}>
          <CircularProgress />
        </Box>
      ) : items.length === 0 ? (
        renderEmpty()
      ) : (
        renderTable()
      )}
    </Box>
  );
}
