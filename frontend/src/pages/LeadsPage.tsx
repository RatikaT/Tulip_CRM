import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Grid,
  Chip,
  IconButton,
  Tooltip,
  Card,
  CardContent,
  Autocomplete,
  Collapse,
  ToggleButtonGroup,
  ToggleButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams, GridRowSelectionModel } from '@mui/x-data-grid';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import FilterListIcon from '@mui/icons-material/FilterList';
import CloseIcon from '@mui/icons-material/Close';
import ViewListIcon from '@mui/icons-material/ViewList';
import PersonIcon from '@mui/icons-material/Person';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import SearchIcon from '@mui/icons-material/Search';
import InputAdornment from '@mui/material/InputAdornment';
import { format, isToday, parseISO } from 'date-fns';
import { toast } from 'react-toastify';
import { useAuthStore } from '../stores/authStore';
import { formatShortDateIST } from '../utils/dateUtils';
import { leadService } from '../services/leadService';
import { Lead, LEAD_STATUS_OPTIONS, LEAD_SOURCE_OPTIONS, SERVICE_REQUESTED_OPTIONS } from '../types/lead.types';
import LeadCreateModal from '../components/leads/LeadCreateModal';
import api from '../services/api';
import { brandColors } from '../theme';
import { loadPersistedFilters, savePersistedFilters, toDateOrNull, dateToIso } from '../utils/filterPersistence';

interface UserOption {
  id: string;
  full_name: string;
  role: string;
}

interface LeadStats {
  total: number;
  new_today: number;
  follow_up_today: number;
  assigned_today: number;
}

// Soft colored pill styles per lead status
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

// Helper function to check if a date string is today
const isDateToday = (dateString: string | null | undefined): boolean => {
  if (!dateString) return false;
  try {
    const date = parseISO(dateString);
    return isToday(date);
  } catch {
    return false;
  }
};

// Check if lead should be highlighted for agents
const shouldHighlightForAgent = (lead: Lead): boolean => {
  // Follow up date is today
  if (lead.follow_up_date && isDateToday(lead.follow_up_date)) return true;

  // Assigned today (assigned_date is today)
  if (isDateToday(lead.assigned_date)) return true;

  // Reassigned today (reassigned_date is today)
  if (isDateToday(lead.reassigned_date)) return true;

  // Created today with assigned_to set (created today AND assigned/reassigned today)
  if (isDateToday(lead.created_at) && (lead.assigned_to || lead.reassign_to)) return true;

  return false;
};

// Expandable cell component for long text
const ExpandableCell = ({ value }: { value: string | null }) => {
  if (!value) return <Typography variant="body2" color="text.secondary">-</Typography>;

  const isLong = value.length > 15;

  return (
    <Tooltip title={isLong ? value : ''} arrow placement="top">
      <Typography
        variant="body2"
        sx={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          cursor: isLong ? 'pointer' : 'default',
        }}
      >
        {value}
      </Typography>
    </Tooltip>
  );
};

export default function LeadsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [paginationModel, setPaginationModel] = useState({
    page: 0,
    pageSize: 25,
  });

  // Search
  const LEADS_FILTERS_KEY = 'tulip_leads_filters';
  const savedLeadFilters = loadPersistedFilters(LEADS_FILTERS_KEY);
  const [searchInput, setSearchInput] = useState<string>((savedLeadFilters.searchInput as string) ?? '');
  const [searchTerm, setSearchTerm] = useState('');

  // Filters - multi-select arrays
  const [statusFilter, setStatusFilter] = useState<string[]>((savedLeadFilters.statusFilter as string[]) ?? []);
  const [sourceFilter, setSourceFilter] = useState<string[]>((savedLeadFilters.sourceFilter as string[]) ?? []);
  const [uhidFilter, setUhidFilter] = useState<string[]>((savedLeadFilters.uhidFilter as string[]) ?? []);
  const [packageRequestedFilter, setPackageRequestedFilter] = useState<string[]>((savedLeadFilters.packageRequestedFilter as string[]) ?? []);
  const [serviceRequestedFilter, setServiceRequestedFilter] = useState<string[]>((savedLeadFilters.serviceRequestedFilter as string[]) ?? []);
  const [assignedToFilter, setAssignedToFilter] = useState<string>((savedLeadFilters.assignedToFilter as string) ?? '');
  const [reassignedToFilter, setReassignedToFilter] = useState<string>((savedLeadFilters.reassignedToFilter as string) ?? '');
  const [createdDateFrom, setCreatedDateFrom] = useState<Date | null>(toDateOrNull(savedLeadFilters.createdDateFrom));
  const [createdDateTo, setCreatedDateTo] = useState<Date | null>(toDateOrNull(savedLeadFilters.createdDateTo));
  const [nextFollowUpDateFilter, setNextFollowUpDateFilter] = useState<Date | null>(toDateOrNull(savedLeadFilters.nextFollowUpDateFilter));
  const [colorFilter, setColorFilter] = useState<string>((savedLeadFilters.colorFilter as string) ?? ''); // 'filled' or 'not_filled' or ''
  const [assignedTodayFilter, setAssignedTodayFilter] = useState<boolean>((savedLeadFilters.assignedTodayFilter as boolean) ?? false);
  const [activeKpi, setActiveKpi] = useState<string>((savedLeadFilters.activeKpi as string) ?? '');
  const [showFilters, setShowFilters] = useState(true);

  // Debounce search input → searchTerm (350ms)
  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);
  const [allUhids, setAllUhids] = useState<string[]>([]);
  const [allPackages, setAllPackages] = useState<string[]>([]);
  const [agents, setAgents] = useState<UserOption[]>([]);

  // Check if any filter is active
  const hasActiveFilters = statusFilter.length > 0 || sourceFilter.length > 0 || uhidFilter.length > 0 || packageRequestedFilter.length > 0 || serviceRequestedFilter.length > 0 || assignedToFilter || reassignedToFilter || createdDateFrom || createdDateTo || nextFollowUpDateFilter || colorFilter || assignedTodayFilter;

  // Get total number of active filter values
  const activeFilterCount = statusFilter.length + sourceFilter.length + uhidFilter.length + packageRequestedFilter.length + serviceRequestedFilter.length + (assignedToFilter ? 1 : 0) + (reassignedToFilter ? 1 : 0) + (createdDateFrom || createdDateTo ? 1 : 0) + (nextFollowUpDateFilter ? 1 : 0) + (colorFilter ? 1 : 0) + (assignedTodayFilter ? 1 : 0);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetLead, setDeleteTargetLead] = useState<Lead | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>([]);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportStartDate, setExportStartDate] = useState<Date | null>(null);
  const [exportEndDate, setExportEndDate] = useState<Date | null>(null);

  // Export state
  const [exporting, setExporting] = useState(false);

  // Stats for admin
  const [stats, setStats] = useState<LeadStats | null>(null);

  // View mode toggle: 'all' for all leads, 'user' for user-level view
  const [viewMode, setViewMode] = useState<'all' | 'user'>((savedLeadFilters.viewMode as 'all' | 'user') ?? 'all');

  // Persist filters so they survive navigating into a lead and back (all roles)
  useEffect(() => {
    savePersistedFilters(LEADS_FILTERS_KEY, {
      searchInput, statusFilter, sourceFilter, uhidFilter, packageRequestedFilter, serviceRequestedFilter,
      assignedToFilter, reassignedToFilter,
      createdDateFrom: dateToIso(createdDateFrom),
      createdDateTo: dateToIso(createdDateTo),
      nextFollowUpDateFilter: dateToIso(nextFollowUpDateFilter),
      colorFilter, assignedTodayFilter, activeKpi, viewMode,
    });
  }, [searchInput, statusFilter, sourceFilter, uhidFilter, packageRequestedFilter, serviceRequestedFilter, assignedToFilter, reassignedToFilter, createdDateFrom, createdDateTo, nextFollowUpDateFilter, colorFilter, assignedTodayFilter, activeKpi, viewMode]);
  const [expandedUsers, setExpandedUsers] = useState<string[]>([]);

  // Filter leads by color filter (client-side filter for highlight status)
  const filteredLeads = useMemo(() => {
    if (!colorFilter) return leads;

    if (colorFilter === 'filled') {
      return leads.filter(l => shouldHighlightForAgent(l));
    } else if (colorFilter === 'not_filled') {
      return leads.filter(l => !shouldHighlightForAgent(l));
    }
    return leads;
  }, [leads, colorFilter]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const data = await leadService.getStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch lead stats:', error);
    }
  }, []);

  // Group leads by UHID for user-level view
  interface UserGroup {
    uhid: string;
    name: string;
    phone_number: string;
    email: string;
    employee_id: string;
    leads: Lead[];
    total_leads: number;
  }

  const groupedByUser = useMemo((): UserGroup[] => {
    const groups: Record<string, UserGroup> = {};
    filteredLeads.forEach((lead) => {
      const uhid = lead.uhid || 'Unknown';
      if (!groups[uhid]) {
        groups[uhid] = {
          uhid,
          name: lead.name || '',
          phone_number: lead.phone_number || '',
          email: lead.email || '',
          employee_id: lead.employee_id || '',
          leads: [],
          total_leads: 0,
        };
      }
      groups[uhid].leads.push(lead);
      groups[uhid].total_leads++;
      // Update user info if this lead has more complete data
      if (!groups[uhid].name && lead.name) {
        groups[uhid].name = lead.name;
      }
      if (!groups[uhid].phone_number && lead.phone_number) {
        groups[uhid].phone_number = lead.phone_number;
      }
      if (!groups[uhid].email && lead.email) {
        groups[uhid].email = lead.email;
      }
      if (!groups[uhid].employee_id && lead.employee_id) {
        groups[uhid].employee_id = lead.employee_id;
      }
    });
    return Object.values(groups).sort((a, b) => b.total_leads - a.total_leads);
  }, [filteredLeads]);

  // Compute user-level stats
  const userLevelStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const uniqueUhids = new Set<string>();
    const usersCreatedToday = new Set<string>();

    filteredLeads.forEach(lead => {
      if (lead.uhid) {
        uniqueUhids.add(lead.uhid);
        const createdDate = new Date(lead.created_at);
        createdDate.setHours(0, 0, 0, 0);
        if (createdDate.getTime() === today.getTime()) {
          usersCreatedToday.add(lead.uhid);
        }
      }
    });

    return {
      totalUsers: uniqueUhids.size,
      usersCreatedToday: usersCreatedToday.size,
      totalLeads: filteredLeads.length,
    };
  }, [filteredLeads]);

  const handleUserExpand = (uhid: string) => {
    setExpandedUsers(prev =>
      prev.includes(uhid) ? prev.filter(u => u !== uhid) : [...prev, uhid]
    );
  };

  // Fetch agents/users for filter - only users with Tulip CRM access
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const response = await api.get<{ users: UserOption[] }>('/users/dropdown', {
          params: { crm_type: 'tulip' }
        });
        setAgents(response.data.users || []);
      } catch (error) {
        console.error('Failed to fetch agents:', error);
      }
    };
    fetchAgents();
  }, []);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const response = await leadService.getLeads({
        page: paginationModel.page + 1,
        per_page: paginationModel.pageSize,
        search: searchTerm || undefined,
        status: statusFilter.length > 0 ? statusFilter : undefined,
        lead_source: sourceFilter.length > 0 ? sourceFilter : undefined,
        uhid: uhidFilter.length > 0 ? uhidFilter : undefined,
        package_requested: packageRequestedFilter.length > 0 ? packageRequestedFilter : undefined,
        service_requested: serviceRequestedFilter.length > 0 ? serviceRequestedFilter : undefined,
        assigned_to: assignedToFilter || undefined,
        reassign_to: reassignedToFilter || undefined,
        created_date_from: createdDateFrom ? format(createdDateFrom, 'yyyy-MM-dd') : undefined,
        created_date_to: createdDateTo ? format(createdDateTo, 'yyyy-MM-dd') : undefined,
        next_follow_up_date: nextFollowUpDateFilter ? format(nextFollowUpDateFilter, 'yyyy-MM-dd') : undefined,
        assigned_today: assignedTodayFilter || undefined,
      });
      setLeads(response.leads);
      setTotalCount(response.total);

      // Extract unique UHIDs and package names for filter dropdowns
      const uniqueUhids = [...new Set(response.leads.map(l => l.uhid).filter(Boolean))] as string[];
      setAllUhids(prev => {
        const combined = [...new Set([...prev, ...uniqueUhids])];
        return combined.sort();
      });

      const uniquePackages = [...new Set(response.leads.map(l => l.package_requested).filter(Boolean))] as string[];
      setAllPackages(prev => {
        const combined = [...new Set([...prev, ...uniquePackages])];
        return combined.sort();
      });
    } catch (error) {
      console.error('Failed to fetch leads:', error);
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [paginationModel, searchTerm, statusFilter, sourceFilter, uhidFilter, packageRequestedFilter, serviceRequestedFilter, assignedToFilter, reassignedToFilter, createdDateFrom, createdDateTo, nextFollowUpDateFilter, assignedTodayFilter]);

  // Reset to page 0 whenever filters/search change so user isn't stranded on a now-empty page
  useEffect(() => {
    setPaginationModel(prev => prev.page === 0 ? prev : { ...prev, page: 0 });
  }, [searchTerm, statusFilter, sourceFilter, uhidFilter, packageRequestedFilter, serviceRequestedFilter, assignedToFilter, reassignedToFilter, createdDateFrom, createdDateTo, nextFollowUpDateFilter, assignedTodayFilter]);

  useEffect(() => {
    fetchLeads();
    fetchStats();
  }, [fetchLeads, fetchStats]);

  const handleViewLead = (lead: Lead) => {
    navigate(`/tulip/leads/${lead.lead_id}`);
  };

  const handleCreateSuccess = () => {
    setCreateModalOpen(false);
    fetchLeads();
    fetchStats();
    toast.success('Lead created successfully');
  };

  const handleDeleteClick = (e: React.MouseEvent, lead: Lead) => {
    e.stopPropagation();
    setDeleteTargetLead(lead);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTargetLead) return;
    setDeleting(true);
    try {
      await leadService.deleteLead(deleteTargetLead.lead_id);
      toast.success('Lead deleted successfully');
      setDeleteDialogOpen(false);
      setDeleteTargetLead(null);
      fetchLeads();
      fetchStats();
    } catch (error) {
      console.error('Failed to delete lead:', error);
      toast.error('Failed to delete lead');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setDeleteTargetLead(null);
  };

  // Map selected DataGrid row ids (Mongo _id) to lead_ids
  const getSelectedLeadIds = (): string[] => {
    const selectedSet = new Set(rowSelectionModel.map((id) => String(id)));
    return filteredLeads
      .filter((lead) => selectedSet.has(String(lead.id)))
      .map((lead) => lead.lead_id);
  };

  const handleBulkDeleteConfirm = async () => {
    const leadIds = getSelectedLeadIds();
    if (leadIds.length === 0) return;
    setBulkDeleting(true);
    try {
      const result = await leadService.bulkDeleteLeads(leadIds);
      toast.success(result.message || `${leadIds.length} lead(s) deleted successfully`);
      setBulkDeleteDialogOpen(false);
      setRowSelectionModel([]);
      fetchLeads();
      fetchStats();
    } catch (error) {
      console.error('Failed to bulk delete leads:', error);
      toast.error('Failed to delete selected leads');
    } finally {
      setBulkDeleting(false);
    }
  };

  const clearAllFilters = () => {
    setStatusFilter([]);
    setSourceFilter([]);
    setUhidFilter([]);
    setPackageRequestedFilter([]);
    setServiceRequestedFilter([]);
    setAssignedToFilter('');
    setReassignedToFilter('');
    setCreatedDateFrom(null);
    setCreatedDateTo(null);
    setNextFollowUpDateFilter(null);
    setColorFilter('');
    setAssignedTodayFilter(false);
    setActiveKpi('');
  };

  // KPI card acts as a quick filter on the table
  const handleKpiClick = (kpi: 'total' | 'new_today' | 'assigned_today' | 'follow_up_today') => {
    if (activeKpi === kpi) {
      clearAllFilters();
      return;
    }
    clearAllFilters();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (kpi === 'new_today') {
      setCreatedDateFrom(today);
      setCreatedDateTo(today);
    } else if (kpi === 'assigned_today') {
      setAssignedTodayFilter(true);
    } else if (kpi === 'follow_up_today') {
      setNextFollowUpDateFilter(today);
    }
    // 'total' = cleared (show all)
    setActiveKpi(kpi);
  };

  // Clickable KPI card that doubles as a quick filter
  const renderKpiCard = (opts: {
    kpiKey: 'total' | 'new_today' | 'assigned_today' | 'follow_up_today';
    title: string;
    value: number | string;
    subtitle?: string;
    icon: React.ReactNode;
    iconBg: string;
    sm: number;
  }) => (
    <Grid item xs={6} sm={opts.sm} sx={{ display: 'flex' }}>
      <Card
        onClick={() => handleKpiClick(opts.kpiKey)}
        sx={{
          background: '#ffffff',
          boxShadow: '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)',
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          width: '100%',
          minHeight: 100,
          cursor: 'pointer',
          transition: 'transform .18s ease, box-shadow .18s ease, border-color .18s ease',
          '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 12px 24px rgba(16,24,40,0.10)' },
          ...(activeKpi === opts.kpiKey && {
            borderColor: 'primary.main',
            boxShadow: '0 0 0 2px rgba(30,64,136,0.35), 0 8px 20px rgba(16,24,40,0.10)',
          }),
        }}
      >
        <CardContent sx={{ py: 2, px: 2.5, '&:last-child': { pb: 2 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box>
              <Typography color="text.secondary" variant="body2" sx={{ mb: 0.5 }}>
                {opts.title}
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 600, color: '#1a1a2e' }}>
                {opts.value}
              </Typography>
              {opts.subtitle && (
                <Typography variant="caption" color="text.secondary">
                  {opts.subtitle}
                </Typography>
              )}
            </Box>
            <Box sx={{ width: 40, height: 40, borderRadius: '50%', background: opts.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {opts.icon}
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Grid>
  );

  const handleExport = async () => {
    setExporting(true);
    try {
      const params: Record<string, string> = {};
      if (exportStartDate) params.start_date = format(exportStartDate, 'yyyy-MM-dd');
      if (exportEndDate) params.end_date = format(exportEndDate, 'yyyy-MM-dd');
      const response = await api.get('/leads/export/excel', {
        responseType: 'blob',
        params,
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;

      // Get filename from header or generate one
      const contentDisposition = response.headers['content-disposition'];
      let filename = `leads_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename=(.+)/);
        if (match) {
          filename = match[1];
        }
      }

      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Export downloaded successfully');
      setExportDialogOpen(false);
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export leads');
    } finally {
      setExporting(false);
    }
  };

  const columns: GridColDef[] = [
    {
      field: 'lead_id',
      headerName: 'Lead ID',
      flex: 1.2,
      minWidth: 140,
      renderCell: (params: GridRenderCellParams) => (
        <Tooltip title={params.value} arrow>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              color: 'primary.main',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {params.value}
          </Typography>
        </Tooltip>
      ),
    },
    {
      field: 'name',
      headerName: 'Name',
      flex: 1,
      minWidth: 100,
      renderCell: (params: GridRenderCellParams) => <ExpandableCell value={params.value} />,
    },
    {
      field: 'status',
      headerName: 'Status',
      flex: 1,
      minWidth: 120,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          label={params.value}
          size="small"
          sx={getStatusChipSx(params.value as string)}
        />
      ),
    },
    {
      field: 'lead_source',
      headerName: 'Source',
      flex: 0.6,
      minWidth: 65,
      renderCell: (params: GridRenderCellParams) => params.value || '-',
    },
    {
      field: 'lead_creation_date',
      headerName: 'Lead Date',
      flex: 0.7,
      minWidth: 80,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.value) return '-';
        return formatShortDateIST(params.value as string);
      },
    },
    {
      field: 'employee_id',
      headerName: 'Emp ID',
      flex: 0.7,
      minWidth: 70,
      renderCell: (params: GridRenderCellParams) => <ExpandableCell value={params.value} />,
    },
    {
      field: 'city',
      headerName: 'City',
      flex: 0.7,
      minWidth: 70,
      renderCell: (params: GridRenderCellParams) => <ExpandableCell value={params.value} />,
    },
    {
      field: 'trimester',
      headerName: 'Trimester',
      flex: 0.9,
      minWidth: 90,
      renderCell: (params: GridRenderCellParams) => <ExpandableCell value={params.value} />,
    },
    {
      field: 'package_requested',
      headerName: 'Package',
      flex: 0.8,
      minWidth: 80,
      renderCell: (params: GridRenderCellParams) => <ExpandableCell value={params.value} />,
    },
    {
      field: 'service_requested',
      headerName: 'Service',
      flex: 0.9,
      minWidth: 85,
      renderCell: (params: GridRenderCellParams) => <ExpandableCell value={params.value} />,
    },
    {
      field: 'number_of_calls',
      headerName: 'Calls',
      flex: 0.4,
      minWidth: 45,
      align: 'center',
      headerAlign: 'center',
    },
    {
      field: 'assigned_to_name',
      headerName: 'Assigned To',
      flex: 0.9,
      minWidth: 90,
      renderCell: (params: GridRenderCellParams) => <ExpandableCell value={params.value} />,
    },
    {
      field: 'created_at',
      headerName: 'Created',
      flex: 0.7,
      minWidth: 75,
      renderCell: (params: GridRenderCellParams) => {
        return formatShortDateIST(params.value as string);
      },
    },
    {
      field: 'updated_at',
      headerName: 'Updated',
      flex: 0.7,
      minWidth: 75,
      renderCell: (params: GridRenderCellParams) => {
        return formatShortDateIST(params.value as string);
      },
    },
    {
      field: 'actions',
      headerName: 'Action',
      width: isAdmin ? 100 : 60,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="View Details">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleViewLead(params.row as Lead);
              }}
              color="primary"
            >
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {isAdmin && (
            <Tooltip title="Delete Lead">
              <IconButton
                size="small"
                onClick={(e) => handleDeleteClick(e, params.row as Lead)}
                color="error"
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      ),
    },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            Leads
          </Typography>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, newValue) => newValue && setViewMode(newValue)}
            size="small"
            sx={{
              '& .MuiToggleButton-root': {
                py: 0.5,
                px: 1.5,
                fontSize: '0.75rem',
                textTransform: 'none',
                border: '1px solid #d6e0ec',
              },
              '& .Mui-selected': {
                bgcolor: '#d6e0ec !important',
                color: '#1a1a2e !important',
                fontWeight: 600,
              },
              '& .MuiToggleButton-root:hover': {
                bgcolor: '#e8eef5',
              },
            }}
          >
            <ToggleButton value="all">
              <ViewListIcon sx={{ fontSize: 16, mr: 0.5 }} />
              All Leads
            </ToggleButton>
            <ToggleButton value="user">
              <PersonIcon sx={{ fontSize: 16, mr: 0.5 }} />
              User Level
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Refresh">
            <IconButton onClick={() => { fetchLeads(); fetchStats(); }} color="primary" size="small">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={() => setExportDialogOpen(true)}
            disabled={exporting}
            size="small"
          >
            {exporting ? 'Exporting...' : 'Export'}
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateModalOpen(true)}
            size="small"
          >
            Add Lead
          </Button>
        </Box>
      </Box>

      {/* Stats Cards - Different for All vs User Level view */}
      {isAdmin && viewMode === 'user' ? (
        <Grid container spacing={2} sx={{ mb: 2 }} alignItems="stretch">
          <Grid item xs={6} sm={4} sx={{ display: 'flex' }}>
            <Card sx={{
              background: '#ffffff',
              boxShadow: '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)',
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              width: '100%',
              minHeight: 100,
              transition: 'transform .18s ease, box-shadow .18s ease',
              '&:hover': {
                transform: 'translateY(-3px)',
                boxShadow: '0 12px 24px rgba(16,24,40,0.10)',
              },
            }}>
              <CardContent sx={{ py: 2, px: 2.5, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box>
                    <Typography color="text.secondary" variant="body2" sx={{ mb: 0.5 }}>
                      Total Users
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 600, color: '#1a1a2e' }}>
                      {userLevelStats.totalUsers}
                    </Typography>
                  </Box>
                  <Box sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <PersonIcon sx={{ color: '#1976d2', fontSize: '1.4rem' }} />
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={4} sx={{ display: 'flex' }}>
            <Card sx={{
              background: '#ffffff',
              boxShadow: '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)',
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              width: '100%',
              minHeight: 100,
              transition: 'transform .18s ease, box-shadow .18s ease',
              '&:hover': {
                transform: 'translateY(-3px)',
                boxShadow: '0 12px 24px rgba(16,24,40,0.10)',
              },
            }}>
              <CardContent sx={{ py: 2, px: 2.5, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box>
                    <Typography color="text.secondary" variant="body2" sx={{ mb: 0.5 }}>
                      Users Added Today
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 600, color: '#1a1a2e' }}>
                      {userLevelStats.usersCreatedToday}
                    </Typography>
                  </Box>
                  <Box sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Typography sx={{ color: '#2e7d32', fontSize: '1.2rem' }}>+</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4} sx={{ display: 'flex' }}>
            <Card sx={{
              background: '#ffffff',
              boxShadow: '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)',
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              width: '100%',
              minHeight: 100,
              transition: 'transform .18s ease, box-shadow .18s ease',
              '&:hover': {
                transform: 'translateY(-3px)',
                boxShadow: '0 12px 24px rgba(16,24,40,0.10)',
              },
            }}>
              <CardContent sx={{ py: 2, px: 2.5, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box>
                    <Typography color="text.secondary" variant="body2" sx={{ mb: 0.5 }}>
                      Total Leads
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 600, color: '#1a1a2e' }}>
                      {userLevelStats.totalLeads}
                    </Typography>
                  </Box>
                  <Box sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Typography sx={{ color: '#f57c00', fontSize: '1.2rem' }}>#</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      ) : isAdmin && stats ? (
        <Grid container spacing={2} sx={{ mb: 2 }} alignItems="stretch">
          {renderKpiCard({
            kpiKey: 'total', sm: 4, title: 'Total Leads', value: stats.total,
            iconBg: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
            icon: <Typography sx={{ color: '#1976d2', fontSize: '1.2rem' }}>#</Typography>,
          })}
          {renderKpiCard({
            kpiKey: 'new_today', sm: 4, title: 'Leads Created Today', value: stats.new_today,
            iconBg: 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)',
            icon: <Typography sx={{ color: '#2e7d32', fontSize: '1.2rem' }}>+</Typography>,
          })}
          {renderKpiCard({
            kpiKey: 'follow_up_today', sm: 4, title: 'Follow-ups Today', value: stats.follow_up_today,
            iconBg: 'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)',
            icon: <Typography sx={{ color: '#f57c00', fontSize: '1.2rem' }}>!</Typography>,
          })}
        </Grid>
      ) : !isAdmin && stats && (
        // Agent Stats Cards - 4 cards showing leads assigned or reassigned to this agent
        <Grid container spacing={2} sx={{ mb: 2 }} alignItems="stretch">
          {renderKpiCard({
            kpiKey: 'total', sm: 3, title: 'Total Leads', value: stats.total, subtitle: 'Assigned/Reassigned to you',
            iconBg: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
            icon: <Typography sx={{ color: '#1976d2', fontSize: '1.2rem' }}>#</Typography>,
          })}
          {renderKpiCard({
            kpiKey: 'new_today', sm: 3, title: 'New Leads Today', value: stats.new_today, subtitle: 'Created today for you',
            iconBg: 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)',
            icon: <Typography sx={{ color: '#2e7d32', fontSize: '1.2rem' }}>+</Typography>,
          })}
          {renderKpiCard({
            kpiKey: 'assigned_today', sm: 3, title: 'Assigned Today', value: stats.assigned_today, subtitle: 'Assigned/Reassigned today',
            iconBg: 'linear-gradient(135deg, #fce4ec 0%, #f8bbd9 100%)',
            icon: <PersonIcon sx={{ color: '#c2185b', fontSize: '1.2rem' }} />,
          })}
          {renderKpiCard({
            kpiKey: 'follow_up_today', sm: 3, title: 'Follow-ups Today', value: stats.follow_up_today, subtitle: 'Leads needing follow-up',
            iconBg: 'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)',
            icon: <Typography sx={{ color: '#f57c00', fontSize: '1.2rem' }}>!</Typography>,
          })}
        </Grid>
      )}

      {/* Search Bar */}
      <Box sx={{ mb: 1.5 }}>
        <TextField
          size="small"
          fullWidth
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search leads by name, UHID, package, phone, email, employee ID, lead ID, city, doctor..."
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              </InputAdornment>
            ),
            endAdornment: searchInput ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearchInput('')}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
          sx={{
            bgcolor: 'white',
            '& .MuiOutlinedInput-root': {
              fontSize: '0.85rem',
              borderRadius: 2.5,
              boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
              transition: 'box-shadow 0.15s ease',
              '&.Mui-focused': {
                boxShadow: '0 0 0 3px rgba(30,64,136,0.12)',
              },
            },
          }}
        />
      </Box>

      {/* Filters Section */}
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <Paper
          elevation={0}
          sx={{
            mb: 2,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 3,
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)',
          }}
        >
          {/* Filter Header */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 2,
              py: 1.25,
              bgcolor: 'rgba(30,64,136,0.04)',
              borderBottom: showFilters ? '1px solid' : 'none',
              borderColor: 'divider',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
              '&:hover': { bgcolor: 'rgba(30,64,136,0.07)' },
            }}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FilterListIcon sx={{ color: 'primary.main', fontSize: 18 }} />
              <Typography sx={{ fontWeight: 700, color: 'primary.dark', fontSize: '0.8rem', letterSpacing: '0.02em' }}>
                Filters
              </Typography>
              {activeFilterCount > 0 && (
                <Chip
                  label={activeFilterCount}
                  size="small"
                  color="primary"
                  sx={{ height: 18, fontSize: '0.65rem', fontWeight: 600 }}
                />
              )}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {hasActiveFilters && (
                <Button
                  variant="text"
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearAllFilters();
                  }}
                  sx={{
                    color: 'error.main',
                    fontSize: '0.65rem',
                    textTransform: 'none',
                    py: 0,
                    minWidth: 0,
                    '&:hover': { bgcolor: 'error.lighter' }
                  }}
                >
                  Clear all
                </Button>
              )}
              <IconButton size="small" sx={{ p: 0.25 }}>
                <CloseIcon
                  sx={{
                    fontSize: 14,
                    transform: showFilters ? 'rotate(0deg)' : 'rotate(45deg)',
                    transition: 'transform 0.2s'
                  }}
                />
              </IconButton>
            </Box>
          </Box>

          {/* Filter Controls */}
          <Collapse in={showFilters}>
            <Box
              sx={{
                p: 2,
                bgcolor: '#f7f9fc',
                // Uniform polish for every filter input in this panel
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  bgcolor: '#fff',
                  transition: 'box-shadow 0.15s ease',
                  '& fieldset': { borderColor: '#e2e8f0' },
                  '&:hover fieldset': { borderColor: '#cbd5e1' },
                  '&.Mui-focused': { boxShadow: '0 0 0 3px rgba(30,64,136,0.12)' },
                  '&.Mui-focused fieldset': { borderColor: 'primary.main', borderWidth: 1 },
                },
              }}
            >
              {/* Compact styles for filter inputs */}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, alignItems: 'center' }}>
                {/* Lead Source - Multi-select */}
                <Autocomplete
                  multiple
                  size="small"
                  options={LEAD_SOURCE_OPTIONS}
                  value={sourceFilter}
                  onChange={(_, newValue) => setSourceFilter(newValue)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Lead Source"
                      placeholder=""
                      sx={{
                        width: 140,
                        '& .MuiInputBase-root': { fontSize: '0.75rem' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem' },
                        '& .MuiOutlinedInput-root': { bgcolor: 'white' },
                      }}
                    />
                  )}
                  renderTags={() => null}
                  disableCloseOnSelect
                />

                {/* Status - Multi-select */}
                <Autocomplete
                  multiple
                  size="small"
                  options={LEAD_STATUS_OPTIONS}
                  value={statusFilter}
                  onChange={(_, newValue) => setStatusFilter(newValue)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Status"
                      placeholder=""
                      sx={{
                        width: 130,
                        '& .MuiInputBase-root': { fontSize: '0.75rem' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem' },
                        '& .MuiOutlinedInput-root': { bgcolor: 'white' },
                      }}
                    />
                  )}
                  renderTags={() => null}
                  disableCloseOnSelect
                />

                {/* UHID - Multi-select (freeSolo: type any UHID) */}
                <Autocomplete
                  multiple
                  freeSolo
                  size="small"
                  options={allUhids}
                  value={uhidFilter}
                  onChange={(_, newValue) => setUhidFilter(newValue.map(v => String(v).trim()).filter(Boolean))}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="UHID"
                      placeholder="Type & Enter"
                      sx={{
                        width: 140,
                        '& .MuiInputBase-root': { fontSize: '0.75rem' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem' },
                        '& .MuiOutlinedInput-root': { bgcolor: 'white' },
                      }}
                    />
                  )}
                  renderTags={() => null}
                  disableCloseOnSelect
                />

                {/* Package Requested - Multi-select (freeSolo: type any package) */}
                <Autocomplete
                  multiple
                  freeSolo
                  size="small"
                  options={allPackages}
                  value={packageRequestedFilter}
                  onChange={(_, newValue) => setPackageRequestedFilter(newValue.map(v => String(v).trim()).filter(Boolean))}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Package"
                      placeholder="Type & Enter"
                      sx={{
                        width: 160,
                        '& .MuiInputBase-root': { fontSize: '0.75rem' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem' },
                        '& .MuiOutlinedInput-root': { bgcolor: 'white' },
                      }}
                    />
                  )}
                  renderTags={() => null}
                  disableCloseOnSelect
                />

                {/* Service - Multi-select (freeSolo: type any service) */}
                <Autocomplete
                  multiple
                  freeSolo
                  size="small"
                  options={SERVICE_REQUESTED_OPTIONS}
                  value={serviceRequestedFilter}
                  onChange={(_, newValue) => setServiceRequestedFilter(newValue.map(v => String(v).trim()).filter(Boolean))}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Service"
                      placeholder="Type & Enter"
                      sx={{
                        width: 160,
                        '& .MuiInputBase-root': { fontSize: '0.75rem' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem' },
                        '& .MuiOutlinedInput-root': { bgcolor: 'white' },
                      }}
                    />
                  )}
                  renderTags={() => null}
                  disableCloseOnSelect
                />

                {/* Created Date Range */}
                <DatePicker
                  label="Created From"
                  value={createdDateFrom}
                  onChange={setCreatedDateFrom}
                  slotProps={{
                    textField: {
                      size: 'small',
                      sx: {
                        width: 135,
                        '& .MuiInputBase-root': { fontSize: '0.75rem' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem' },
                        '& .MuiOutlinedInput-root': { bgcolor: 'white' },
                      }
                    },
                    field: { clearable: true }
                  }}
                />
                <DatePicker
                  label="Created To"
                  value={createdDateTo}
                  onChange={setCreatedDateTo}
                  minDate={createdDateFrom || undefined}
                  slotProps={{
                    textField: {
                      size: 'small',
                      sx: {
                        width: 125,
                        '& .MuiInputBase-root': { fontSize: '0.75rem' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem' },
                        '& .MuiOutlinedInput-root': { bgcolor: 'white' },
                      }
                    },
                    field: { clearable: true }
                  }}
                />

                {/* Next Follow Up Date */}
                <DatePicker
                  label="Next Follow Up"
                  value={nextFollowUpDateFilter}
                  onChange={setNextFollowUpDateFilter}
                  slotProps={{
                    textField: {
                      size: 'small',
                      sx: {
                        width: 140,
                        '& .MuiInputBase-root': { fontSize: '0.75rem' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem' },
                        '& .MuiOutlinedInput-root': { bgcolor: 'white' },
                      }
                    },
                    field: { clearable: true }
                  }}
                />

                {/* Assigned To */}
                <Autocomplete
                  size="small"
                  options={agents}
                  getOptionLabel={(option) => option.full_name}
                  value={agents.find(a => a.id === assignedToFilter) || null}
                  onChange={(_, newValue) => setAssignedToFilter(newValue?.id || '')}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Assigned To"
                      placeholder=""
                      sx={{
                        width: 150,
                        '& .MuiInputBase-root': { fontSize: '0.75rem' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem' },
                        '& .MuiOutlinedInput-root': { bgcolor: 'white' },
                      }}
                    />
                  )}
                />

                {/* Reassigned To */}
                <Autocomplete
                  size="small"
                  options={agents}
                  getOptionLabel={(option) => option.full_name}
                  value={agents.find(a => a.id === reassignedToFilter) || null}
                  onChange={(_, newValue) => setReassignedToFilter(newValue?.id || '')}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Reassigned To"
                      placeholder=""
                      sx={{
                        width: 150,
                        '& .MuiInputBase-root': { fontSize: '0.75rem' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem' },
                        '& .MuiOutlinedInput-root': { bgcolor: 'white' },
                      }}
                    />
                  )}
                />

                {/* Color Filter - only shown for agents */}
                {!isAdmin && (
                  <Autocomplete
                    size="small"
                    options={[
                      { value: 'filled', label: 'Highlighted (Yellow)' },
                      { value: 'not_filled', label: 'Not Highlighted' },
                    ]}
                    getOptionLabel={(option) => option.label}
                    value={colorFilter ? { value: colorFilter, label: colorFilter === 'filled' ? 'Highlighted (Yellow)' : 'Not Highlighted' } : null}
                    onChange={(_, newValue) => setColorFilter(newValue?.value || '')}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Color"
                        placeholder=""
                        sx={{
                          width: 150,
                          '& .MuiInputBase-root': { fontSize: '0.75rem' },
                          '& .MuiInputLabel-root': { fontSize: '0.75rem' },
                          '& .MuiOutlinedInput-root': { bgcolor: colorFilter === 'filled' ? '#fff9c4' : 'white' },
                        }}
                      />
                    )}
                    isOptionEqualToValue={(option, value) => option.value === value.value}
                  />
                )}
              </Box>

              {/* Selected Filters - text with cross icon below */}
              {hasActiveFilters && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1, pt: 1, borderTop: '1px solid #f0f0f0' }}>
                  {sourceFilter.map((source) => (
                    <Box
                      key={`source-${source}`}
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        cursor: 'pointer',
                        px: 1,
                        py: 0.25,
                        borderRadius: '999px',
                        bgcolor: 'rgba(30,64,136,0.08)',
                        border: '1px solid rgba(30,64,136,0.18)',
                        transition: 'all 0.15s ease',
                        '&:hover': { bgcolor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.30)' },
                      }}
                      onClick={() => setSourceFilter(prev => prev.filter(s => s !== source))}
                    >
                      <Typography sx={{ fontSize: '0.7rem', color: 'primary.dark', fontWeight: 600 }}>{source}</Typography>
                      <CloseIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    </Box>
                  ))}
                  {statusFilter.map((status) => (
                    <Box
                      key={`status-${status}`}
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        cursor: 'pointer',
                        px: 1,
                        py: 0.25,
                        borderRadius: '999px',
                        bgcolor: 'rgba(30,64,136,0.08)',
                        border: '1px solid rgba(30,64,136,0.18)',
                        transition: 'all 0.15s ease',
                        '&:hover': { bgcolor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.30)' },
                      }}
                      onClick={() => setStatusFilter(prev => prev.filter(s => s !== status))}
                    >
                      <Typography sx={{ fontSize: '0.7rem', color: 'primary.dark', fontWeight: 600 }}>{status}</Typography>
                      <CloseIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    </Box>
                  ))}
                  {uhidFilter.map((uhid) => (
                    <Box
                      key={`uhid-${uhid}`}
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        cursor: 'pointer',
                        px: 1,
                        py: 0.25,
                        borderRadius: '999px',
                        bgcolor: 'rgba(30,64,136,0.08)',
                        border: '1px solid rgba(30,64,136,0.18)',
                        transition: 'all 0.15s ease',
                        '&:hover': { bgcolor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.30)' },
                      }}
                      onClick={() => setUhidFilter(prev => prev.filter(u => u !== uhid))}
                    >
                      <Typography sx={{ fontSize: '0.7rem', color: 'primary.dark', fontWeight: 600 }}>UHID: {uhid}</Typography>
                      <CloseIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    </Box>
                  ))}
                  {packageRequestedFilter.map((pkg) => (
                    <Box
                      key={`pkg-${pkg}`}
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        cursor: 'pointer',
                        px: 1,
                        py: 0.25,
                        borderRadius: '999px',
                        bgcolor: 'rgba(30,64,136,0.08)',
                        border: '1px solid rgba(30,64,136,0.18)',
                        transition: 'all 0.15s ease',
                        '&:hover': { bgcolor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.30)' },
                      }}
                      onClick={() => setPackageRequestedFilter(prev => prev.filter(p => p !== pkg))}
                    >
                      <Typography sx={{ fontSize: '0.7rem', color: 'primary.dark', fontWeight: 600 }}>Package: {pkg}</Typography>
                      <CloseIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    </Box>
                  ))}
                  {serviceRequestedFilter.map((svc) => (
                    <Box
                      key={`svc-${svc}`}
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        cursor: 'pointer',
                        px: 1,
                        py: 0.25,
                        borderRadius: '999px',
                        bgcolor: 'rgba(30,64,136,0.08)',
                        border: '1px solid rgba(30,64,136,0.18)',
                        transition: 'all 0.15s ease',
                        '&:hover': { bgcolor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.30)' },
                      }}
                      onClick={() => setServiceRequestedFilter(prev => prev.filter(s => s !== svc))}
                    >
                      <Typography sx={{ fontSize: '0.7rem', color: 'primary.dark', fontWeight: 600 }}>Service: {svc}</Typography>
                      <CloseIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    </Box>
                  ))}
                  {(createdDateFrom || createdDateTo) && (
                    <Box
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        cursor: 'pointer',
                        px: 1,
                        py: 0.25,
                        borderRadius: '999px',
                        bgcolor: 'rgba(30,64,136,0.08)',
                        border: '1px solid rgba(30,64,136,0.18)',
                        transition: 'all 0.15s ease',
                        '&:hover': { bgcolor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.30)' },
                      }}
                      onClick={() => { setCreatedDateFrom(null); setCreatedDateTo(null); }}
                    >
                      <Typography sx={{ fontSize: '0.7rem', color: 'primary.dark', fontWeight: 600 }}>
                        Created: {createdDateFrom ? format(createdDateFrom, 'dd/MM/yy') : '...'} - {createdDateTo ? format(createdDateTo, 'dd/MM/yy') : '...'}
                      </Typography>
                      <CloseIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    </Box>
                  )}
                  {nextFollowUpDateFilter && (
                    <Box
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        cursor: 'pointer',
                        px: 1,
                        py: 0.25,
                        borderRadius: '999px',
                        bgcolor: 'rgba(30,64,136,0.08)',
                        border: '1px solid rgba(30,64,136,0.18)',
                        transition: 'all 0.15s ease',
                        '&:hover': { bgcolor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.30)' },
                      }}
                      onClick={() => setNextFollowUpDateFilter(null)}
                    >
                      <Typography sx={{ fontSize: '0.7rem', color: 'primary.dark', fontWeight: 600 }}>
                        Follow Up: {format(nextFollowUpDateFilter, 'dd/MM/yy')}
                      </Typography>
                      <CloseIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    </Box>
                  )}
                  {assignedToFilter && (
                    <Box
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        cursor: 'pointer',
                        px: 1,
                        py: 0.25,
                        borderRadius: '999px',
                        bgcolor: 'rgba(30,64,136,0.08)',
                        border: '1px solid rgba(30,64,136,0.18)',
                        transition: 'all 0.15s ease',
                        '&:hover': { bgcolor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.30)' },
                      }}
                      onClick={() => setAssignedToFilter('')}
                    >
                      <Typography sx={{ fontSize: '0.7rem', color: 'primary.dark', fontWeight: 600 }}>
                        Assigned: {agents.find(a => a.id === assignedToFilter)?.full_name || assignedToFilter}
                      </Typography>
                      <CloseIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    </Box>
                  )}
                  {reassignedToFilter && (
                    <Box
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        cursor: 'pointer',
                        px: 1,
                        py: 0.25,
                        borderRadius: '999px',
                        bgcolor: 'rgba(30,64,136,0.08)',
                        border: '1px solid rgba(30,64,136,0.18)',
                        transition: 'all 0.15s ease',
                        '&:hover': { bgcolor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.30)' },
                      }}
                      onClick={() => setReassignedToFilter('')}
                    >
                      <Typography sx={{ fontSize: '0.7rem', color: 'primary.dark', fontWeight: 600 }}>
                        Reassigned: {agents.find(a => a.id === reassignedToFilter)?.full_name || reassignedToFilter}
                      </Typography>
                      <CloseIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    </Box>
                  )}
                  {assignedTodayFilter && (
                    <Box
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        cursor: 'pointer',
                        px: 1,
                        py: 0.25,
                        borderRadius: '999px',
                        bgcolor: 'rgba(30,64,136,0.08)',
                        border: '1px solid rgba(30,64,136,0.18)',
                        transition: 'all 0.15s ease',
                        '&:hover': { bgcolor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.30)' },
                      }}
                      onClick={() => { setAssignedTodayFilter(false); setActiveKpi(''); }}
                    >
                      <Typography sx={{ fontSize: '0.7rem', color: 'primary.dark', fontWeight: 600 }}>
                        Assigned Today
                      </Typography>
                      <CloseIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    </Box>
                  )}
                  {colorFilter && (
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.25,
                        cursor: 'pointer',
                        bgcolor: colorFilter === 'filled' ? '#fff9c4' : 'transparent',
                        px: 0.5,
                        borderRadius: 0.5,
                      }}
                      onClick={() => setColorFilter('')}
                    >
                      <Typography sx={{ fontSize: '0.7rem', color: 'primary.dark', fontWeight: 600 }}>
                        Color: {colorFilter === 'filled' ? 'Highlighted (Yellow)' : 'Not Highlighted'}
                      </Typography>
                      <CloseIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          </Collapse>
        </Paper>
      </LocalizationProvider>

      {/* Data Grid - All Leads View */}
      {viewMode === 'all' && (
        <>
        {isAdmin && rowSelectionModel.length > 0 && (
          <Box
            sx={{
              mb: 1.5,
              px: 2,
              py: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderRadius: 3,
              bgcolor: '#eaf0fa',
              border: '1px solid',
              borderColor: 'primary.light',
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.dark' }}>
              {rowSelectionModel.length} lead{rowSelectionModel.length > 1 ? 's' : ''} selected
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button size="small" onClick={() => setRowSelectionModel([])}>
                Clear
              </Button>
              <Button
                size="small"
                variant="contained"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => setBulkDeleteDialogOpen(true)}
              >
                Delete Selected
              </Button>
            </Box>
          </Box>
        )}
        <Paper
          elevation={0}
          sx={{
            height: 'calc(100vh - 380px)',
            minHeight: 400,
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)',
          }}
        >
          <DataGrid
            rows={filteredLeads}
            columns={columns}
            loading={loading}
            rowCount={totalCount}
            pageSizeOptions={[10, 25, 50, 100]}
            paginationModel={paginationModel}
            paginationMode="server"
            onPaginationModelChange={setPaginationModel}
            getRowId={(row) => row.id}
            disableRowSelectionOnClick
            checkboxSelection={isAdmin}
            rowSelectionModel={rowSelectionModel}
            onRowSelectionModelChange={(newSelection) => setRowSelectionModel(newSelection)}
            disableColumnMenu
            columnHeaderHeight={48}
            rowHeight={52}
            getRowClassName={(params) => {
              const classes: string[] = [];
              // Zebra striping
              if (params.indexRelativeToCurrentPage % 2 === 1) {
                classes.push('row-even');
              }
              // Only highlight for agents (non-admins)
              if (!isAdmin && shouldHighlightForAgent(params.row as Lead)) {
                classes.push('highlight-row');
              }
              return classes.join(' ');
            }}
            sx={{
              border: 'none',
              fontSize: '0.85rem',
              '--DataGrid-rowBorderColor': 'transparent',
              '& .MuiDataGrid-columnHeaders, & .MuiDataGrid-columnHeader, & .MuiDataGrid-columnHeadersInner, & .MuiDataGrid-columnHeaderRow': {
                backgroundColor: `${brandColors.navyBlue} !important`,
                color: '#fff',
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              },
              '& .MuiDataGrid-columnSeparator': {
                color: 'rgba(255,255,255,0.25)',
              },
              '& .MuiDataGrid-iconButtonContainer .MuiSvgIcon-root, & .MuiDataGrid-sortIcon': {
                color: '#fff',
              },
              '& .MuiDataGrid-columnHeaderTitle': {
                whiteSpace: 'normal',
                lineHeight: 1.2,
                textAlign: 'center',
                fontWeight: 700,
              },
              '& .MuiDataGrid-cell': {
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                borderBottom: 'none',
              },
              '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': {
                outline: 'none',
              },
              '& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within': {
                outline: 'none',
              },
              '& .MuiDataGrid-row': {
                borderBottom: '1px solid #eef1f5',
                transition: 'background-color 0.15s ease',
              },
              '& .MuiDataGrid-row.row-even': {
                backgroundColor: '#f7f9fc',
              },
              '& .MuiDataGrid-row:hover': {
                backgroundColor: '#eaf0fa',
                cursor: 'pointer',
              },
              '& .MuiDataGrid-footerContainer': {
                borderTop: '1px solid #eef1f5',
                backgroundColor: '#fafbfc',
              },
              '& .MuiDataGrid-virtualScroller': {
                backgroundColor: '#fff',
              },
              // Yellow highlight for agent priority rows
              '& .MuiDataGrid-row.highlight-row': {
                backgroundColor: '#fff9c4',
                '&:hover': {
                  backgroundColor: '#fff59d',
                },
              },
            }}
            onRowClick={(params) => handleViewLead(params.row as Lead)}
          />
        </Paper>
        </>
      )}

      {/* User Level View */}
      {viewMode === 'user' && (
        <Paper sx={{ p: 2, maxHeight: 'calc(100vh - 380px)', overflow: 'auto' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
              <Typography color="text.secondary">Loading...</Typography>
            </Box>
          ) : groupedByUser.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
              <Typography color="text.secondary">No leads found</Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Showing {groupedByUser.length} unique users with {filteredLeads.length} leads
              </Typography>
              {groupedByUser.map((userGroup) => (
                <Accordion
                  key={userGroup.uhid}
                  expanded={expandedUsers.includes(userGroup.uhid)}
                  onChange={() => handleUserExpand(userGroup.uhid)}
                  sx={{
                    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                    '&:before': { display: 'none' },
                    borderRadius: '8px !important',
                    mb: 0.5,
                    '&.Mui-expanded': { margin: '0 0 4px 0 !important' },
                  }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    sx={{
                      bgcolor: '#f8f9fa',
                      borderRadius: expandedUsers.includes(userGroup.uhid) ? '8px 8px 0 0' : '8px',
                      minHeight: 56,
                      '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 2 },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
                      <Box
                        sx={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          bgcolor: 'primary.main',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <PersonIcon sx={{ color: 'white', fontSize: 20 }} />
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>
                          {userGroup.name || 'Unknown User'}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.25 }}>
                          <Typography variant="caption" color="text.secondary">
                            UHID: <strong>{userGroup.uhid}</strong>
                          </Typography>
                          {userGroup.employee_id && (
                            <Typography variant="caption" color="text.secondary">
                              Emp ID: {userGroup.employee_id}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {userGroup.phone_number && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <PhoneIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                            <Typography variant="caption" color="text.secondary">
                              {userGroup.phone_number}
                            </Typography>
                          </Box>
                        )}
                        {userGroup.email && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <EmailIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                            <Typography variant="caption" color="text.secondary">
                              {userGroup.email}
                            </Typography>
                          </Box>
                        )}
                        <Chip
                          label={`${userGroup.total_leads} lead${userGroup.total_leads > 1 ? 's' : ''}`}
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ fontSize: '0.7rem' }}
                        />
                      </Box>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails sx={{ p: 0 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: '#d6e0ec' }}>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Lead ID</TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Source</TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Status</TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Service</TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Assigned To</TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Created</TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', width: isAdmin ? 100 : 60 }}>Action</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {userGroup.leads.map((lead) => (
                          <TableRow
                            key={lead.id}
                            hover
                            sx={{
                              cursor: 'pointer',
                              '&:hover': {
                                bgcolor: '#f8f9fa',
                              },
                            }}
                            onClick={() => handleViewLead(lead)}
                          >
                            <TableCell sx={{ fontSize: '0.8rem', color: 'primary.main', fontWeight: 500 }}>
                              {lead.lead_id}
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {lead.lead_source || '-'}
                            </TableCell>
                            <TableCell>
                              {lead.status ? (
                                <Chip
                                  label={lead.status}
                                  size="small"
                                  sx={{ ...getStatusChipSx(lead.status), fontSize: '0.65rem', height: 22 }}
                                />
                              ) : '-'}
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {lead.service_requested || '-'}
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {lead.assigned_to_name || '-'}
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {formatShortDateIST(lead.created_at)}
                            </TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', gap: 0.5 }}>
                                <Tooltip title="View Details">
                                  <IconButton
                                    size="small"
                                    color="primary"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleViewLead(lead);
                                    }}
                                  >
                                    <VisibilityIcon sx={{ fontSize: 18 }} />
                                  </IconButton>
                                </Tooltip>
                                {isAdmin && (
                                  <Tooltip title="Delete Lead">
                                    <IconButton
                                      size="small"
                                      color="error"
                                      onClick={(e) => handleDeleteClick(e, lead)}
                                    >
                                      <DeleteIcon sx={{ fontSize: 18 }} />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </Box>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </AccordionDetails>
                </Accordion>
              ))}
            </Box>
          )}
        </Paper>
      )}

      {/* Create Modal */}
      <LeadCreateModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={handleCreateSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
      >
        <DialogTitle>Delete Lead</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete lead <strong>{deleteTargetLead?.lead_id}</strong>
            {deleteTargetLead?.name ? ` (${deleteTargetLead.name})` : ''}? This action will remove it from the list.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} disabled={deleting}>
            No
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained" disabled={deleting}>
            {deleting ? 'Deleting...' : 'Yes, Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog
        open={bulkDeleteDialogOpen}
        onClose={() => !bulkDeleting && setBulkDeleteDialogOpen(false)}
      >
        <DialogTitle>Delete Selected Leads</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete <strong>{rowSelectionModel.length}</strong> selected
            lead{rowSelectionModel.length > 1 ? 's' : ''}? This action will remove them from the list.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDeleteDialogOpen(false)} disabled={bulkDeleting}>
            No
          </Button>
          <Button onClick={handleBulkDeleteConfirm} color="error" variant="contained" disabled={bulkDeleting}>
            {bulkDeleting ? 'Deleting...' : `Yes, Delete ${rowSelectionModel.length}`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Export Date Range Dialog */}
      <Dialog
        open={exportDialogOpen}
        onClose={() => !exporting && setExportDialogOpen(false)}
        PaperProps={{ sx: { borderRadius: 3, width: 420, maxWidth: '90vw' } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Export Leads</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Choose a date range to export leads created within it (IST). Leave both blank to export all.
          </DialogContentText>
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <Box sx={{ display: 'flex', gap: 1.5, mt: 1 }}>
              <DatePicker
                label="From"
                value={exportStartDate}
                onChange={(d) => setExportStartDate(d)}
                maxDate={exportEndDate || undefined}
                slotProps={{ textField: { size: 'small', fullWidth: true } }}
              />
              <DatePicker
                label="To"
                value={exportEndDate}
                onChange={(d) => setExportEndDate(d)}
                minDate={exportStartDate || undefined}
                slotProps={{ textField: { size: 'small', fullWidth: true } }}
              />
            </Box>
          </LocalizationProvider>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => { setExportStartDate(null); setExportEndDate(null); }}
            disabled={exporting || (!exportStartDate && !exportEndDate)}
            sx={{ textTransform: 'none', mr: 'auto' }}
          >
            Clear
          </Button>
          <Button onClick={() => setExportDialogOpen(false)} disabled={exporting} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            variant="contained"
            disabled={exporting}
            startIcon={<DownloadIcon />}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {exporting ? 'Exporting...' : 'Export'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
