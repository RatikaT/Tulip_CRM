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
  Pagination,
  IconButton,
  Tooltip,
  Card,
  CardContent,
  Autocomplete,
  Collapse,
  MenuItem,
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
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import FilterListIcon from '@mui/icons-material/FilterList';
import CloseIcon from '@mui/icons-material/Close';
import ViewListIcon from '@mui/icons-material/ViewList';
import PersonIcon from '@mui/icons-material/Person';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import SearchIcon from '@mui/icons-material/Search';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import RouteIcon from '@mui/icons-material/Route';
import InputAdornment from '@mui/material/InputAdornment';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { useAuthStore } from '../stores/authStore';
import { formatShortDateIST, istDateKey, todayISTKey } from '../utils/dateUtils';
import { enrollmentService } from '../services/enrollmentService';
import type { UserGroupsResponse } from '../services/leadService';
import {
  Enrollment,
  EnrollmentStatsResponse,
} from '../types/enrollment.types';
import { useDropdownOptions } from '../hooks/useDropdownOptions';
import EnrollmentViewModal from '../components/enrollments/EnrollmentViewModal';
import EnrollmentCreateModal from '../components/enrollments/EnrollmentCreateModal';
import BulkUploadModal from '../components/enrollments/BulkUploadModal';
import api from '../services/api';
import { brandColors } from '../theme';
import { loadPersistedFilters, savePersistedFilters, toDateOrNull, dateToIso } from '../utils/filterPersistence';

interface UserOption {
  id: string;
  full_name: string;
  role: string;
}

const connectStatusColors: Record<string, string> = {
  'Connected': '#0f8a63',
  'No Response': '#b26a00',
  'Follow Up Required': '#1E4088',
  'Others': '#475569',
};

const actionTakenColors: Record<string, string> = {
  'Appointment Booked': '#0f8a63',
  'Feedback Taken': '#1565c0',
  'No Action Required': '#475569',
  'Liasoned with Partner Team': '#7B4B94',
};

// Soft colored pill style for status chips
const softChipSx = (hex: string) => ({
  bgcolor: `${hex}1A`,
  color: hex,
  fontWeight: 600,
  fontSize: '0.7rem',
  height: 24,
  borderRadius: '8px',
  border: `1px solid ${hex}33`,
  '& .MuiChip-label': { px: 1 },
});

// Helper function to check if a date string is today
const isDateToday = (dateString: string | null): boolean => {
  // Compare IST calendar days; naive server timestamps are UTC.
  return !!dateString && istDateKey(dateString) === todayISTKey();
};

// Check if enrollment should be highlighted for agents
const shouldHighlightForAgent = (enrollment: Enrollment): boolean => {
  // Follow up date is today
  if (isDateToday(enrollment.next_follow_up_date)) return true;

  // Assigned today (assigned_date or reassigned_date is today)
  if (isDateToday(enrollment.assigned_date)) return true;
  if (isDateToday(enrollment.reassigned_date)) return true;

  // Created today with hclhc_spoc assigned
  if (isDateToday(enrollment.created_at) && enrollment.hclhc_spoc) return true;

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

export default function EnrollmentsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // Dropdown filter options — live from admin-managed config (fallback to constants).
  const { options: connectStatusOptions } = useDropdownOptions('connect_status');
  const { options: actionTakenOptions } = useDropdownOptions('action_taken');
  const { options: servicePartnerOptions } = useDropdownOptions('service_partner');
  const { options: serviceEnrolledOptions } = useDropdownOptions('service_enrolled');
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isSuperAdmin = user?.role === 'super_admin';
  const canCreate = isAdmin || user?.role === 'agent'; // Agents can also create enrollments

  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [paginationModel, setPaginationModel] = useState({
    page: 0,
    pageSize: 25,
  });

  // Stats
  const [stats, setStats] = useState<EnrollmentStatsResponse | null>(null);

  // Search
  const ENROLLMENTS_FILTERS_KEY = 'tulip_enrollments_filters';
  const savedEnrollmentFilters = loadPersistedFilters(ENROLLMENTS_FILTERS_KEY);
  const [searchInput, setSearchInput] = useState<string>((savedEnrollmentFilters.searchInput as string) ?? '');
  const [searchTerm, setSearchTerm] = useState('');

  // Filters - multi-select arrays
  const [connectStatusFilter, setConnectStatusFilter] = useState<string[]>((savedEnrollmentFilters.connectStatusFilter as string[]) ?? []);
  const [actionTakenFilter, setActionTakenFilter] = useState<string[]>((savedEnrollmentFilters.actionTakenFilter as string[]) ?? []);
  const [servicePartnerFilter, setServicePartnerFilter] = useState<string[]>((savedEnrollmentFilters.servicePartnerFilter as string[]) ?? []);
  const [serviceEnrolledFilter, setServiceEnrolledFilter] = useState<string[]>((savedEnrollmentFilters.serviceEnrolledFilter as string[]) ?? []);
  const [packageFilter, setPackageFilter] = useState<string>((savedEnrollmentFilters.packageFilter as string) ?? '');
  const [uhidFilter, setUhidFilter] = useState<string[]>((savedEnrollmentFilters.uhidFilter as string[]) ?? []);
  const [hclhcSpocFilter, setHclhcSpocFilter] = useState<string>((savedEnrollmentFilters.hclhcSpocFilter as string) ?? '');
  const [myRoleFilter, setMyRoleFilter] = useState<'' | 'following_up' | 'enrolled'>((savedEnrollmentFilters.myRoleFilter as '' | 'following_up' | 'enrolled') ?? '');

  // Debounce search input → searchTerm (350ms)
  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);
  const [createdDateFrom, setCreatedDateFrom] = useState<Date | null>(toDateOrNull(savedEnrollmentFilters.createdDateFrom));
  const [createdDateTo, setCreatedDateTo] = useState<Date | null>(toDateOrNull(savedEnrollmentFilters.createdDateTo));
  const [nextFollowUpDateFilter, setNextFollowUpDateFilter] = useState<Date | null>(toDateOrNull(savedEnrollmentFilters.nextFollowUpDateFilter));
  const [assignedTodayFilter, setAssignedTodayFilter] = useState<boolean>((savedEnrollmentFilters.assignedTodayFilter as boolean) ?? false);
  const [activeKpi, setActiveKpi] = useState<string>((savedEnrollmentFilters.activeKpi as string) ?? '');
  const [showFilters, setShowFilters] = useState(true);
  const [allUhids, setAllUhids] = useState<string[]>([]);
  const [tulipUsers, setTulipUsers] = useState<UserOption[]>([]);

  // Check if any filter is active
  const hasActiveFilters = connectStatusFilter.length > 0 || actionTakenFilter.length > 0 || servicePartnerFilter.length > 0 || serviceEnrolledFilter.length > 0 || packageFilter || uhidFilter.length > 0 || hclhcSpocFilter || createdDateFrom || createdDateTo || nextFollowUpDateFilter || assignedTodayFilter || (user?.role === 'agent' && !!myRoleFilter);

  // Get total number of active filter values
  const activeFilterCount = connectStatusFilter.length + actionTakenFilter.length + servicePartnerFilter.length + serviceEnrolledFilter.length + (packageFilter ? 1 : 0) + uhidFilter.length + (hclhcSpocFilter ? 1 : 0) + (createdDateFrom || createdDateTo ? 1 : 0) + (nextFollowUpDateFilter ? 1 : 0) + (assignedTodayFilter ? 1 : 0) + (user?.role === 'agent' && myRoleFilter ? 1 : 0);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [bulkUploadModalOpen, setBulkUploadModalOpen] = useState(false);
  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetEnrollment, setDeleteTargetEnrollment] = useState<Enrollment | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  // View mode toggle: 'all' for all enrollments, 'user' for user-level view
  const [viewMode, setViewMode] = useState<'all' | 'user'>((savedEnrollmentFilters.viewMode as 'all' | 'user') ?? 'all');

  // Persist filters so they survive navigating into an enrollment and back (all roles)
  useEffect(() => {
    savePersistedFilters(ENROLLMENTS_FILTERS_KEY, {
      searchInput, connectStatusFilter, actionTakenFilter, servicePartnerFilter, serviceEnrolledFilter, packageFilter, uhidFilter,
      hclhcSpocFilter, myRoleFilter,
      createdDateFrom: dateToIso(createdDateFrom),
      createdDateTo: dateToIso(createdDateTo),
      nextFollowUpDateFilter: dateToIso(nextFollowUpDateFilter),
      assignedTodayFilter, activeKpi, viewMode,
    });
  }, [searchInput, connectStatusFilter, actionTakenFilter, servicePartnerFilter, serviceEnrolledFilter, packageFilter, uhidFilter, hclhcSpocFilter, myRoleFilter, createdDateFrom, createdDateTo, nextFollowUpDateFilter, assignedTodayFilter, activeKpi, viewMode]);
  const [expandedUsers, setExpandedUsers] = useState<string[]>([]);

  // The colour filter was removed (the Follow-ups / New-Assigned cards cover it
  // across all records); rows are still highlighted yellow.
  const filteredEnrollments = enrollments;

  // Group enrollments by UHID for user-level view
  interface UserGroup {
    uhid: string;
    subscriber_name: string;
    phone_number: string;
    email: string;
    employee_id: string;
    enrollments: Enrollment[];
    total_enrollments: number;
  }

  // User Level view comes from the server, grouped across ALL matching enrollments
  const [userGroupsData, setUserGroupsData] = useState<UserGroupsResponse<Enrollment> | null>(null);
  const [groupPage, setGroupPage] = useState(1);
  const [groupsLoading, setGroupsLoading] = useState(false);

  const groupedByUser = useMemo((): UserGroup[] => (userGroupsData?.groups || []).map((g) => {
    const pick = (f: (e: Enrollment) => string | null | undefined) => g.records.map(f).find(Boolean) || '';
    return {
      uhid: g.uhid,
      subscriber_name: pick((e) => e.subscriber_name),
      phone_number: pick((e) => e.phone_number),
      email: pick((e) => e.email),
      employee_id: pick((e) => e.employee_id),
      enrollments: g.records,
      total_enrollments: g.records.length,
    };
  }), [userGroupsData]);

  const userLevelStats = {
    totalUsers: userGroupsData?.total_users ?? 0,
    usersEnrolledToday: userGroupsData?.users_created_today ?? 0,
    totalEnrollments: userGroupsData?.total_records ?? 0,
  };

  const handleUserExpand = (uhid: string) => {
    setExpandedUsers(prev =>
      prev.includes(uhid) ? prev.filter(u => u !== uhid) : [...prev, uhid]
    );
  };

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const data = await enrollmentService.getStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, []);

  // The filters behind the list on screen; the MIS export sends exactly the same
  // (the colour filter is screen-only and stays out of both).
  const listFilters = () => ({
    search: searchTerm || undefined,
    connect_status: connectStatusFilter.length > 0 ? connectStatusFilter : undefined,
    action_taken: actionTakenFilter.length > 0 ? actionTakenFilter : undefined,
    service_partner: servicePartnerFilter.length > 0 ? servicePartnerFilter : undefined,
    service_enrolled: serviceEnrolledFilter.length > 0 ? serviceEnrolledFilter : undefined,
    package: packageFilter || undefined,
    uhid: uhidFilter.length > 0 ? uhidFilter : undefined,
    hclhc_spoc: hclhcSpocFilter || undefined,
    my_role: myRoleFilter || undefined,
    created_date_from: createdDateFrom ? format(createdDateFrom, 'yyyy-MM-dd') : undefined,
    created_date_to: createdDateTo ? format(createdDateTo, 'yyyy-MM-dd') : undefined,
    next_follow_up_date: nextFollowUpDateFilter ? format(nextFollowUpDateFilter, 'yyyy-MM-dd') : undefined,
    assigned_today: assignedTodayFilter || undefined,
    // Card filters: due today / overdue (no action since) / stopped or DNC
    follow_ups_due: ({ follow_up_today: 'all', follow_up_due_today: 'today', follow_up_overdue: 'overdue' } as const)[
      activeKpi as 'follow_up_today' | 'follow_up_due_today' | 'follow_up_overdue'] ?? undefined,
    stopped_or_dnc: activeKpi === 'stopped_or_dnc' || undefined,
  });

  const fetchEnrollments = useCallback(async () => {
    setLoading(true);
    try {
      const response = await enrollmentService.getEnrollments({
        page: paginationModel.page + 1,
        per_page: paginationModel.pageSize,
        ...listFilters(),
      });
      setEnrollments(response.enrollments);
      setTotalCount(response.total);

      // Extract unique UHIDs for the filter dropdown
      const uniqueUhids = [...new Set(response.enrollments.map(e => e.uhid).filter(Boolean))] as string[];
      setAllUhids(prev => {
        const combined = [...new Set([...prev, ...uniqueUhids])];
        return combined.sort();
      });
    } catch (error) {
      console.error('Failed to fetch enrollments:', error);
      toast.error('Failed to load enrollments');
    } finally {
      setLoading(false);
    }
  }, [paginationModel, searchTerm, connectStatusFilter, actionTakenFilter, servicePartnerFilter, serviceEnrolledFilter, packageFilter, uhidFilter, hclhcSpocFilter, myRoleFilter, createdDateFrom, createdDateTo, nextFollowUpDateFilter, assignedTodayFilter]);

  // Reset to page 0 whenever filters/search change so user isn't stranded on a now-empty page
  useEffect(() => {
    setPaginationModel(prev => prev.page === 0 ? prev : { ...prev, page: 0 });
  }, [searchTerm, connectStatusFilter, actionTakenFilter, servicePartnerFilter, serviceEnrolledFilter, packageFilter, uhidFilter, hclhcSpocFilter, myRoleFilter, createdDateFrom, createdDateTo, nextFollowUpDateFilter, assignedTodayFilter]);

  useEffect(() => {
    fetchEnrollments();
    fetchStats();
  }, [fetchEnrollments, fetchStats]);

  const fetchUserGroups = useCallback(async () => {
    if (viewMode !== 'user' || !isAdmin) return;
    setGroupsLoading(true);
    try {
      setUserGroupsData(await enrollmentService.getUserGroups(listFilters(), groupPage));
    } catch (error) {
      console.error('Failed to fetch user groups:', error);
      toast.error('Failed to load the User Level view');
    } finally {
      setGroupsLoading(false);
    }
  }, [viewMode, isAdmin, groupPage, searchTerm, connectStatusFilter, actionTakenFilter, servicePartnerFilter, serviceEnrolledFilter, packageFilter, uhidFilter, hclhcSpocFilter, myRoleFilter, createdDateFrom, createdDateTo, nextFollowUpDateFilter, assignedTodayFilter, activeKpi]);

  useEffect(() => { fetchUserGroups(); }, [fetchUserGroups]);
  // Back to the first page of groups whenever the filters change
  useEffect(() => { setGroupPage(1); }, [searchTerm, connectStatusFilter, actionTakenFilter, servicePartnerFilter, serviceEnrolledFilter, packageFilter, uhidFilter, hclhcSpocFilter, myRoleFilter, createdDateFrom, createdDateTo, nextFollowUpDateFilter, assignedTodayFilter, activeKpi]);

  // Fetch users tagged for Tulip CRM for HCLH SPOC (Nurture Buddy) dropdown
  useEffect(() => {
    const fetchTulipUsers = async () => {
      try {
        const response = await api.get<{ users: UserOption[] }>('/users/dropdown', {
          params: { crm_type: 'tulip' }
        });
        const users = response.data.users || [];
        setTulipUsers(users);
      } catch (error) {
        console.error('Failed to fetch users:', error);
      }
    };
    fetchTulipUsers();
  }, []);

  const handleViewEnrollment = (enrollment: Enrollment) => {
    navigate(`/tulip/enrollments/${enrollment.enrollment_id}`);
  };

  const handleCreateSuccess = () => {
    setCreateModalOpen(false);
    fetchEnrollments();
    fetchStats();
    toast.success('Enrollment created successfully');
  };

  const handleUpdateSuccess = () => {
    setViewModalOpen(false);
    setSelectedEnrollment(null);
    fetchEnrollments();
    fetchStats();
    toast.success('Enrollment updated successfully');
  };

  const handleBulkUploadSuccess = () => {
    setBulkUploadModalOpen(false);
    fetchEnrollments();
    fetchStats();
  };

  const handleDeleteClick = (e: React.MouseEvent, enrollment: Enrollment) => {
    e.stopPropagation();
    setDeleteTargetEnrollment(enrollment);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTargetEnrollment) return;
    setDeleting(true);
    try {
      await enrollmentService.deleteEnrollment(deleteTargetEnrollment.enrollment_id);
      toast.success('Enrollment deleted successfully');
      setDeleteDialogOpen(false);
      setDeleteTargetEnrollment(null);
      fetchEnrollments();
      fetchStats();
    } catch (error) {
      console.error('Failed to delete enrollment:', error);
      toast.error('Failed to delete enrollment');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setDeleteTargetEnrollment(null);
  };

  const clearAllFilters = () => {
    setConnectStatusFilter([]);
    setActionTakenFilter([]);
    setServicePartnerFilter([]);
    setServiceEnrolledFilter([]);
    setPackageFilter('');
    setUhidFilter([]);
    setHclhcSpocFilter('');
    setMyRoleFilter('');
    setCreatedDateFrom(null);
    setCreatedDateTo(null);
    setNextFollowUpDateFilter(null);
    setAssignedTodayFilter(false);
    setActiveKpi('');
  };

  // KPI card acts as a quick filter on the table
  type KpiKey = 'total' | 'new_today' | 'assigned_today' | 'follow_up_today' | 'follow_up_due_today' | 'follow_up_overdue' | 'stopped_or_dnc';
  const handleKpiClick = (kpi: KpiKey) => {
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
    }
    // follow-up and stopped/DNC cards filter on the server via activeKpi
    // 'total' = cleared (show all)
    setActiveKpi(kpi);
  };

  // Follow-ups Today (with Due today / Overdue buttons) + Stopped / DNC, both layouts
  const followUpCards = (sm: number, md: number) => stats && (
    <>
      {renderKpiCard({
        kpiKey: 'follow_up_today', sm, md, title: 'Follow-ups Today', value: stats.follow_up_today,
        alsoActiveFor: ['follow_up_due_today', 'follow_up_overdue'],
        extra: (
          <Box sx={{ display: 'flex', gap: 0.75, mt: 0.75, flexWrap: 'wrap' }}>
            <Chip
              size="small"
              label={`Due today ${stats.follow_up_due_today ?? 0}`}
              onClick={(e) => { e.stopPropagation(); handleKpiClick('follow_up_due_today'); }}
              sx={{ fontWeight: 600, bgcolor: activeKpi === 'follow_up_due_today' ? '#f57c00' : '#fff3e0',
                    color: activeKpi === 'follow_up_due_today' ? '#fff' : '#e65100' }}
            />
            <Chip
              size="small"
              label={`Overdue ${stats.follow_up_overdue ?? 0}`}
              onClick={(e) => { e.stopPropagation(); handleKpiClick('follow_up_overdue'); }}
              sx={{ fontWeight: 600, bgcolor: activeKpi === 'follow_up_overdue' ? '#c62828' : '#ffebee',
                    color: activeKpi === 'follow_up_overdue' ? '#fff' : '#c62828' }}
            />
          </Box>
        ),
        iconBg: 'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)',
        icon: <Typography sx={{ color: '#f57c00', fontSize: '1.2rem' }}>!</Typography>,
      })}
      {renderKpiCard({
        kpiKey: 'stopped_or_dnc', sm, md, title: 'Paused / Stopped / DNC', value: stats.stopped_or_dnc ?? 0,
        subtitle: 'Not to be contacted for now',
        iconBg: 'linear-gradient(135deg, #eceff1 0%, #cfd8dc 100%)',
        icon: <Typography sx={{ color: '#455a64', fontSize: '1.2rem' }}>⊘</Typography>,
      })}
    </>
  );

  // Clickable KPI card that doubles as a quick filter
  const renderKpiCard = (opts: {
    kpiKey: KpiKey;
    title: string;
    value: number | string;
    subtitle?: string;
    icon: React.ReactNode;
    iconBg: string;
    sm: number;
    md?: number;
    extra?: React.ReactNode;
    alsoActiveFor?: KpiKey[];
  }) => (
    <Grid item xs={6} sm={opts.sm} md={opts.md ?? opts.sm} sx={{ display: 'flex' }}>
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
          ...((activeKpi === opts.kpiKey || (opts.alsoActiveFor || []).includes(activeKpi as KpiKey)) && {
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
              {opts.extra}
            </Box>
            <Box sx={{ width: 40, height: 40, borderRadius: '50%', background: opts.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {opts.icon}
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Grid>
  );

  // Super-admin one-time fix: fill blank HCLH SPOC (Nurture Buddy) from the enrolling agent.
  const [backfillingSpoc, setBackfillingSpoc] = useState(false);
  const handleBackfillSpoc = async () => {
    setBackfillingSpoc(true);
    try {
      const result = await enrollmentService.backfillSpoc();
      toast.success(
        result.updated > 0
          ? `Backfilled HCLH SPOC (Nurture Buddy) on ${result.updated} enrollment(s)`
          : 'No enrollments needed an HCLH SPOC (Nurture Buddy) backfill'
      );
      // Refresh so the updated SPOCs show immediately
      fetchEnrollments();
      fetchStats();
    } catch (error) {
      console.error('Backfill SPOC failed:', error);
      const msg =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to backfill HCLH SPOC (Nurture Buddy)';
      toast.error(msg);
    } finally {
      setBackfillingSpoc(false);
    }
  };

  // Super-admin one-click: fill source on enrollments converted from a lead.
  const [backfillingSource, setBackfillingSource] = useState(false);
  const handleBackfillSource = async () => {
    setBackfillingSource(true);
    try {
      const result = await enrollmentService.backfillSource();
      toast.success(
        result.updated > 0
          ? `Backfilled source on ${result.updated} enrollment(s)`
          : 'No enrollments needed a source backfill'
      );
      fetchEnrollments();
    } catch (error) {
      console.error('Backfill source failed:', error);
      const msg =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to backfill source';
      toast.error(msg);
    } finally {
      setBackfillingSource(false);
    }
  };

  // Super-admin one-click: build care journeys for existing enrolled leads.
  const [backfillingJourneys, setBackfillingJourneys] = useState(false);
  const handleBackfillJourneys = async () => {
    setBackfillingJourneys(true);
    try {
      const result = await enrollmentService.backfillJourneys();
      toast.success(
        result.built > 0
          ? `Built care journeys for ${result.built} enrollment(s)`
          : 'All eligible enrollments already have a care journey'
      );
      fetchEnrollments();
      fetchStats();
    } catch (error) {
      console.error('Backfill journeys failed:', error);
      const msg =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to backfill care journeys';
      toast.error(msg);
    } finally {
      setBackfillingJourneys(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await enrollmentService.exportExcel(listFilters());
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `enrollments_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Export downloaded successfully');
      setExportDialogOpen(false);
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export enrollments');
    } finally {
      setExporting(false);
    }
  };

  const columns: GridColDef[] = ([
    {
      field: 'enrollment_id',
      headerName: 'Enrollment ID',
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
      field: 'subscriber_name',
      headerName: 'Subscriber Name',
      flex: 1,
      minWidth: 120,
      renderCell: (params: GridRenderCellParams) => <ExpandableCell value={params.value} />,
    },
    user?.role === 'agent' ? {
      field: 'my_role',
      headerName: 'My Role',
      width: 140,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => {
        const row = params.row as Enrollment;
        const isSpoc = !!row.hclhc_spoc && row.hclhc_spoc.trim().toLowerCase() === (user?.full_name || '').trim().toLowerCase();
        return isSpoc ? (
          <Chip label="Following up" size="small" sx={softChipSx('#16a34a')} />
        ) : (
          <Chip label="Enrolled by me" size="small" sx={softChipSx('#64748b')} />
        );
      },
    } : null,
    {
      field: 'employee_id',
      headerName: 'EmployeeID',
      flex: 0.8,
      minWidth: 80,
      renderCell: (params: GridRenderCellParams) => <ExpandableCell value={params.value} />,
    },
    {
      field: 'phone_number',
      headerName: 'Contact No.',
      flex: 0.9,
      minWidth: 100,
      renderCell: (params: GridRenderCellParams) => <ExpandableCell value={params.value} />,
    },
    {
      field: 'service_partner',
      headerName: 'Partner',
      flex: 0.8,
      minWidth: 90,
      renderCell: (params: GridRenderCellParams) => <ExpandableCell value={params.value} />,
    },
    {
      field: 'connect_status',
      headerName: 'Connect Status',
      flex: 1,
      minWidth: 120,
      renderCell: (params: GridRenderCellParams) => (
        params.value ? (
          <Chip
            label={params.value}
            size="small"
            sx={softChipSx(connectStatusColors[params.value as string] || '#475569')}
          />
        ) : '-'
      ),
    },
    {
      field: 'action_taken',
      headerName: 'Action Taken',
      flex: 1.1,
      minWidth: 130,
      renderCell: (params: GridRenderCellParams) => (
        params.value ? (
          <Chip
            label={params.value}
            size="small"
            sx={softChipSx(actionTakenColors[params.value as string] || '#475569')}
          />
        ) : '-'
      ),
    },
    {
      field: 'next_follow_up_date',
      headerName: 'Next Follow-up Due',
      flex: 1,
      minWidth: 130,
      renderCell: (params: GridRenderCellParams) => {
        const e = params.row as Enrollment;
        const today = todayISTKey();
        const stopped = e.journey_status === 'stopped' || e.journey_status === 'paused' || e.do_not_contact;
        if (e.journey_status === 'paused') {
          return (
            <Chip size="small" label={`Paused until ${formatShortDateIST(e.resume_on as string)}`}
              title={e.pause_reason || undefined} sx={{ fontWeight: 600, bgcolor: '#e3f2fd', color: '#1565c0' }} />
          );
        }
        const late = stopped ? [] : (e.journey || [])
          .filter((st) => st.status === 'pending' && st.planned_date && (istDateKey(st.planned_date) || '') < today)
          .sort((x, y) => String(x.planned_date).localeCompare(String(y.planned_date)));
        const key = istDateKey(params.value as string);
        const date = params.value
          ? (key === today
            ? <Chip size="small" label="Today" sx={{ fontWeight: 600, bgcolor: '#fff3e0', color: '#e65100' }} />
            : key && key < today && !stopped
              ? <Chip size="small" label={`Overdue · ${formatShortDateIST(params.value as string)}`} sx={{ fontWeight: 600, bgcolor: '#ffebee', color: '#c62828' }} />
              : formatShortDateIST(params.value as string))
          : '-';
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 0.25, lineHeight: 1.2, minWidth: 0, width: '100%' }}>
            <Box>{date}</Box>
            {late.length > 0 && (
              <Typography
                variant="caption"
                noWrap
                title={`${late.length} care step${late.length === 1 ? '' : 's'} overdue · oldest: ${late[0].name}, ${formatShortDateIST(late[0].planned_date as string)}`}
                sx={{ color: '#c62828', display: 'block', maxWidth: '100%' }}
              >
                {late.length} care step{late.length === 1 ? '' : 's'} overdue · oldest: {late[0].name}, {formatShortDateIST(late[0].planned_date as string)}
              </Typography>
            )}
          </Box>
        );
      },
    },
    {
      field: 'billed_date',
      headerName: 'Billed',
      flex: 0.7,
      minWidth: 80,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.value) return '-';
        return formatShortDateIST(params.value as string);
      },
    },
    {
      field: 'trimester',
      headerName: 'Trimester',
      flex: 0.8,
      minWidth: 85,
      renderCell: (params: GridRenderCellParams) => <ExpandableCell value={params.value} />,
    },
    {
      field: 'service_enrolled',
      headerName: 'Service',
      flex: 0.8,
      minWidth: 110,
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
                handleViewEnrollment(params.row as Enrollment);
              }}
              color="primary"
            >
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {isAdmin && (
            <Tooltip title="Delete Enrollment">
              <IconButton
                size="small"
                onClick={(e) => handleDeleteClick(e, params.row as Enrollment)}
                color="error"
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      ),
    },
  ] as (GridColDef | null)[]).filter(Boolean) as GridColDef[];

  // Compact styles for filter inputs
  const compactInputSx = {
    '& .MuiInputBase-root': { fontSize: '0.75rem' },
    '& .MuiInputLabel-root': { fontSize: '0.75rem' },
    '& .MuiOutlinedInput-root': { bgcolor: 'white' },
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            Enrollments
          </Typography>
          {/* View Mode Toggle */}
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, newMode) => newMode && setViewMode(newMode)}
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
              All Enrollments
            </ToggleButton>
            <ToggleButton value="user">
              <PersonIcon sx={{ fontSize: 16, mr: 0.5 }} />
              User Level
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Refresh">
            <IconButton onClick={() => { fetchEnrollments(); fetchStats(); fetchUserGroups(); }} color="primary" size="small">
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
          {isSuperAdmin && (
            <Tooltip title="Fill blank HCLH SPOC (Nurture Buddy) on old enrollments from the enrolling agent">
              <span>
                <Button
                  variant="outlined"
                  startIcon={<GroupAddIcon />}
                  onClick={handleBackfillSpoc}
                  disabled={backfillingSpoc}
                  size="small"
                >
                  {backfillingSpoc ? 'Backfilling...' : 'Backfill SPOC'}
                </Button>
              </span>
            </Tooltip>
          )}
          {isSuperAdmin && (
            <Tooltip title="Fill Source on enrollments converted from a lead that don't have one (copies from the linked lead)">
              <span>
                <Button
                  variant="outlined"
                  onClick={handleBackfillSource}
                  disabled={backfillingSource}
                  size="small"
                >
                  {backfillingSource ? 'Backfilling...' : 'Backfill Source'}
                </Button>
              </span>
            </Tooltip>
          )}
          {isSuperAdmin && (
            <Tooltip title="Build care journeys for existing enrolled leads that don't have one (resolves legacy service names)">
              <span>
                <Button
                  variant="outlined"
                  startIcon={<RouteIcon />}
                  onClick={handleBackfillJourneys}
                  disabled={backfillingJourneys}
                  size="small"
                >
                  {backfillingJourneys ? 'Building...' : 'Backfill Journeys'}
                </Button>
              </span>
            </Tooltip>
          )}
          {isAdmin && (
            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={() => setBulkUploadModalOpen(true)}
              size="small"
            >
              Bulk Upload
            </Button>
          )}
          {canCreate && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreateModalOpen(true)}
              size="small"
            >
              Add Enrollment
            </Button>
          )}
        </Box>
      </Box>

      {/* Stats Cards - Different for Agents vs Admins, and All vs User Level view */}
      {/* User Level stats only shown for admins */}
      {viewMode === 'user' && isAdmin ? (
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
                      Users Enrolled Today
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 600, color: '#1a1a2e' }}>
                      {userLevelStats.usersEnrolledToday}
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
                      Total Enrollments
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 600, color: '#1a1a2e' }}>
                      {userLevelStats.totalEnrollments}
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
      ) : stats && !isAdmin ? (
        /* Agent Stats Cards - 4 cards for agents */
        <Grid container spacing={2} sx={{ mb: 2 }} alignItems="stretch">
          {renderKpiCard({
            kpiKey: 'total', sm: 6, md: 3, title: 'Total Enrollments', value: stats.total, subtitle: 'You are the Nurture Buddy',
            iconBg: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
            icon: <PersonIcon sx={{ color: '#1976d2', fontSize: '1.4rem' }} />,
          })}
          {renderKpiCard({
            kpiKey: 'assigned_today', sm: 6, md: 3, title: 'New / Assigned Today', value: stats.assigned_today,
            subtitle: 'Given to you today: new or reassigned',
            iconBg: 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)',
            icon: <Typography sx={{ color: '#2e7d32', fontSize: '1.2rem' }}>+</Typography>,
          })}
          {followUpCards(6, 3)}
        </Grid>
      ) : stats && isAdmin && (
        /* Admin Stats Cards - 3 cards */
        <Grid container spacing={2} sx={{ mb: 2 }} alignItems="stretch">
          {renderKpiCard({
            kpiKey: 'total', sm: 6, md: 3, title: 'Total Enrollments', value: stats.total,
            iconBg: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
            icon: <Typography sx={{ color: '#1976d2', fontSize: '1.2rem' }}>#</Typography>,
          })}
          {renderKpiCard({
            kpiKey: 'new_today', sm: 6, md: 3, title: 'Enrollments Created Today', value: stats.new_today,
            iconBg: 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)',
            icon: <Typography sx={{ color: '#2e7d32', fontSize: '1.2rem' }}>+</Typography>,
          })}
          {followUpCards(6, 3)}
        </Grid>
      )}

      {/* Search Bar */}
      <Box sx={{ mb: 1.5 }}>
        <TextField
          size="small"
          fullWidth
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search enrollments by name, UHID, package, phone, email, employee ID, enrollment ID, doctor, SPOC..."
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
              '&.Mui-focused': { boxShadow: '0 0 0 3px rgba(30,64,136,0.12)' },
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
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, alignItems: 'center' }}>
                {/* Connect Status - Multi-select */}
                <Autocomplete
                  multiple
                  size="small"
                  options={connectStatusOptions}
                  value={connectStatusFilter}
                  onChange={(_, newValue) => setConnectStatusFilter(newValue)}
                  renderInput={(params) => (
                    <TextField {...params} label="Connect Status" placeholder="" sx={{ ...compactInputSx, width: 130 }} />
                  )}
                  renderTags={() => null}
                  disableCloseOnSelect
                />

                {/* Action Taken - Multi-select */}
                <Autocomplete
                  multiple
                  size="small"
                  options={actionTakenOptions}
                  value={actionTakenFilter}
                  onChange={(_, newValue) => setActionTakenFilter(newValue)}
                  renderInput={(params) => (
                    <TextField {...params} label="Action Taken" placeholder="" sx={{ ...compactInputSx, width: 125 }} />
                  )}
                  renderTags={() => null}
                  disableCloseOnSelect
                />

                {/* Service Partner - Multi-select */}
                <Autocomplete
                  multiple
                  size="small"
                  options={servicePartnerOptions}
                  value={servicePartnerFilter}
                  onChange={(_, newValue) => setServicePartnerFilter(newValue)}
                  renderInput={(params) => (
                    <TextField {...params} label="Service Partner" placeholder="" sx={{ ...compactInputSx, width: 135 }} />
                  )}
                  renderTags={() => null}
                  disableCloseOnSelect
                />

                {/* Service - Multi-select (freeSolo) */}
                <Autocomplete
                  multiple
                  freeSolo
                  size="small"
                  options={serviceEnrolledOptions}
                  value={serviceEnrolledFilter}
                  onChange={(_, newValue) => setServiceEnrolledFilter(newValue.map(v => String(v).trim()).filter(Boolean))}
                  renderInput={(params) => (
                    <TextField {...params} label="Service" placeholder="" sx={{ ...compactInputSx, width: 150 }} />
                  )}
                  renderTags={() => null}
                  disableCloseOnSelect
                />

                {/* Package - free text */}
                <TextField
                  size="small"
                  label="Package"
                  value={packageFilter}
                  onChange={(e) => setPackageFilter(e.target.value)}
                  sx={{ ...compactInputSx, width: 150 }}
                />

                {/* My Role - only shown for agents */}
                {user?.role === 'agent' && (
                  <TextField
                    select
                    size="small"
                    label="My Role"
                    value={myRoleFilter}
                    onChange={(e) => setMyRoleFilter(e.target.value as '' | 'following_up' | 'enrolled')}
                    sx={{ ...compactInputSx, width: 150 }}
                  >
                    <MenuItem value="">All roles</MenuItem>
                    <MenuItem value="following_up">Following up</MenuItem>
                    <MenuItem value="enrolled">Enrolled by me</MenuItem>
                  </TextField>
                )}

                {/* UHID - Multi-select (freeSolo: type any UHID) */}
                <Autocomplete
                  multiple
                  freeSolo
                  size="small"
                  options={allUhids}
                  value={uhidFilter}
                  onChange={(_, newValue) => setUhidFilter(newValue.map(v => String(v).trim()).filter(Boolean))}
                  renderInput={(params) => (
                    <TextField {...params} label="UHID" placeholder="Type & Enter" sx={{ ...compactInputSx, width: 140 }} />
                  )}
                  renderTags={() => null}
                  disableCloseOnSelect
                />

                {/* HCLH SPOC (Nurture Buddy) - User dropdown */}
                <Autocomplete
                  size="small"
                  options={tulipUsers}
                  getOptionLabel={(option) => option.full_name}
                  value={tulipUsers.find(u => u.full_name === hclhcSpocFilter) || null}
                  onChange={(_, newValue) => setHclhcSpocFilter(newValue?.full_name || '')}
                  renderInput={(params) => (
                    <TextField {...params} label="HCLH SPOC (Nurture Buddy)" placeholder="" sx={{ ...compactInputSx, width: 210 }} />
                  )}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                />

                {/* Created Date Range */}
                <DatePicker
                  label="Created From"
                  value={createdDateFrom}
                  onChange={setCreatedDateFrom}
                  slotProps={{
                    textField: { size: 'small', sx: { ...compactInputSx, width: 135 } },
                    field: { clearable: true }
                  }}
                />
                <DatePicker
                  label="Created To"
                  value={createdDateTo}
                  onChange={setCreatedDateTo}
                  minDate={createdDateFrom || undefined}
                  slotProps={{
                    textField: { size: 'small', sx: { ...compactInputSx, width: 125 } },
                    field: { clearable: true }
                  }}
                />

                {/* Next Follow-up Due */}
                <DatePicker
                  label="Next Follow-up Due"
                  value={nextFollowUpDateFilter}
                  onChange={setNextFollowUpDateFilter}
                  slotProps={{
                    textField: { size: 'small', sx: { ...compactInputSx, width: 165 } },
                    field: { clearable: true }
                  }}
                />


              </Box>

              {/* Selected Filters - text with cross icon below */}
              {hasActiveFilters && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1, pt: 1, borderTop: '1px solid #f0f0f0' }}>
                  {connectStatusFilter.map((status) => (
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
                      onClick={() => setConnectStatusFilter(prev => prev.filter(s => s !== status))}
                    >
                      <Typography sx={{ fontSize: '0.7rem', color: 'primary.dark', fontWeight: 600 }}>{status}</Typography>
                      <CloseIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    </Box>
                  ))}
                  {actionTakenFilter.map((action) => (
                    <Box
                      key={`action-${action}`}
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
                      onClick={() => setActionTakenFilter(prev => prev.filter(a => a !== action))}
                    >
                      <Typography sx={{ fontSize: '0.7rem', color: 'primary.dark', fontWeight: 600 }}>{action}</Typography>
                      <CloseIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    </Box>
                  ))}
                  {servicePartnerFilter.map((partner) => (
                    <Box
                      key={`partner-${partner}`}
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
                      onClick={() => setServicePartnerFilter(prev => prev.filter(p => p !== partner))}
                    >
                      <Typography sx={{ fontSize: '0.7rem', color: 'primary.dark', fontWeight: 600 }}>{partner}</Typography>
                      <CloseIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    </Box>
                  ))}
                  {serviceEnrolledFilter.map((service) => (
                    <Box
                      key={`service-${service}`}
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
                      onClick={() => setServiceEnrolledFilter(prev => prev.filter(s => s !== service))}
                    >
                      <Typography sx={{ fontSize: '0.7rem', color: 'primary.dark', fontWeight: 600 }}>Service: {service}</Typography>
                      <CloseIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    </Box>
                  ))}
                  {packageFilter && (
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
                      onClick={() => setPackageFilter('')}
                    >
                      <Typography sx={{ fontSize: '0.7rem', color: 'primary.dark', fontWeight: 600 }}>Package: {packageFilter}</Typography>
                      <CloseIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    </Box>
                  )}
                  {user?.role === 'agent' && myRoleFilter && (
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
                      onClick={() => setMyRoleFilter('')}
                    >
                      <Typography sx={{ fontSize: '0.7rem', color: 'primary.dark', fontWeight: 600 }}>
                        Role: {myRoleFilter === 'following_up' ? 'Following up' : 'Enrolled by me'}
                      </Typography>
                      <CloseIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    </Box>
                  )}
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
                  {hclhcSpocFilter && (
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
                      onClick={() => setHclhcSpocFilter('')}
                    >
                      <Typography sx={{ fontSize: '0.7rem', color: 'primary.dark', fontWeight: 600 }}>HCLH SPOC (Nurture Buddy): {hclhcSpocFilter}</Typography>
                      <CloseIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    </Box>
                  )}
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
                        Next Follow-up Due: {format(nextFollowUpDateFilter, 'dd/MM/yy')}
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
                </Box>
              )}
            </Box>
          </Collapse>
        </Paper>
      </LocalizationProvider>

      {/* Data Grid - All Enrollments View */}
      {viewMode === 'all' && (
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
            rows={filteredEnrollments}
            columns={columns}
            loading={loading}
            rowCount={totalCount}
            pageSizeOptions={[10, 25, 50, 100]}
            paginationModel={paginationModel}
            paginationMode="server"
            onPaginationModelChange={setPaginationModel}
            getRowId={(row) => row.id}
            disableRowSelectionOnClick
            disableColumnMenu
            columnHeaderHeight={48}
            rowHeight={52}
            getRowClassName={(params) => {
              const classes: string[] = [];
              if (params.indexRelativeToCurrentPage % 2 === 1) {
                classes.push('row-even');
              }
              // Only highlight for agents (non-admins)
              if (!isAdmin && shouldHighlightForAgent(params.row as Enrollment)) {
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
            onRowClick={(params) => handleViewEnrollment(params.row as Enrollment)}
          />
        </Paper>
      )}

      {/* User Level View */}
      {viewMode === 'user' && (
        <Paper sx={{ p: 2, maxHeight: 'calc(100vh - 380px)', overflow: 'auto' }}>
          {groupsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <Typography color="text.secondary">Loading...</Typography>
            </Box>
          ) : groupedByUser.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <Typography color="text.secondary">No enrollments found</Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  {userGroupsData?.total_groups.toLocaleString('en-IN')} customers with {userGroupsData?.total_records.toLocaleString('en-IN')} enrollments
                  {userGroupsData && userGroupsData.pages > 1 ? ` · page ${groupPage} of ${userGroupsData.pages}` : ''}
                </Typography>
                {userGroupsData && userGroupsData.pages > 1 && (
                  <Pagination size="small" count={userGroupsData.pages} page={groupPage} onChange={(_, p) => setGroupPage(p)} />
                )}
              </Box>
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
                          {userGroup.subscriber_name || 'Unknown User'}
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
                          label={`${userGroup.total_enrollments} enrollment${userGroup.total_enrollments > 1 ? 's' : ''}`}
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
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Enrollment ID</TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Partner</TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Connect Status</TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Action Taken</TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Next Follow-up Due</TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Created</TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', width: isAdmin ? 100 : 60 }}>Action</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {userGroup.enrollments.map((enrollment) => (
                          <TableRow
                            key={enrollment.id}
                            hover
                            sx={{
                              cursor: 'pointer',
                              // Yellow highlight for agent priority rows
                              bgcolor: !isAdmin && shouldHighlightForAgent(enrollment) ? '#fff9c4' : 'inherit',
                              '&:hover': {
                                bgcolor: !isAdmin && shouldHighlightForAgent(enrollment) ? '#fff59d' : '#f8f9fa',
                              },
                            }}
                            onClick={() => handleViewEnrollment(enrollment)}
                          >
                            <TableCell sx={{ fontSize: '0.8rem', color: 'primary.main', fontWeight: 500 }}>
                              {enrollment.enrollment_id}
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {enrollment.service_partner || '-'}
                            </TableCell>
                            <TableCell>
                              {enrollment.connect_status ? (
                                <Chip
                                  label={enrollment.connect_status}
                                  size="small"
                                  sx={{ ...softChipSx(connectStatusColors[enrollment.connect_status] || '#475569'), fontSize: '0.65rem', height: 22 }}
                                />
                              ) : '-'}
                            </TableCell>
                            <TableCell>
                              {enrollment.action_taken ? (
                                <Chip
                                  label={enrollment.action_taken}
                                  size="small"
                                  sx={{ ...softChipSx(actionTakenColors[enrollment.action_taken] || '#475569'), fontSize: '0.65rem', height: 22 }}
                                />
                              ) : '-'}
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {enrollment.next_follow_up_date
                                ? formatShortDateIST(enrollment.next_follow_up_date)
                                : '-'}
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {formatShortDateIST(enrollment.created_at)}
                            </TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', gap: 0.5 }}>
                                <Tooltip title="View Details">
                                  <IconButton
                                    size="small"
                                    color="primary"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleViewEnrollment(enrollment);
                                    }}
                                  >
                                    <VisibilityIcon sx={{ fontSize: 18 }} />
                                  </IconButton>
                                </Tooltip>
                                {isAdmin && (
                                  <Tooltip title="Delete Enrollment">
                                    <IconButton
                                      size="small"
                                      color="error"
                                      onClick={(e) => handleDeleteClick(e, enrollment)}
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
      {canCreate && (
        <EnrollmentCreateModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {/* View/Edit Modal */}
      {selectedEnrollment && (
        <EnrollmentViewModal
          open={viewModalOpen}
          enrollment={selectedEnrollment}
          onClose={() => {
            setViewModalOpen(false);
            setSelectedEnrollment(null);
          }}
          onSuccess={handleUpdateSuccess}
        />
      )}

      {/* Bulk Upload Modal */}
      {isAdmin && (
        <BulkUploadModal
          open={bulkUploadModalOpen}
          onClose={() => setBulkUploadModalOpen(false)}
          onSuccess={handleBulkUploadSuccess}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
      >
        <DialogTitle>Delete Enrollment</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete enrollment <strong>{deleteTargetEnrollment?.enrollment_id}</strong>
            {deleteTargetEnrollment?.subscriber_name ? ` (${deleteTargetEnrollment.subscriber_name})` : ''}? This action will remove it from the list.
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

      {/* Export Date Range Dialog */}
      <Dialog
        open={exportDialogOpen}
        onClose={() => !exporting && setExportDialogOpen(false)}
        PaperProps={{ sx: { borderRadius: 3, width: 420, maxWidth: '90vw' } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Export Enrollments</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 1.5 }}>
            {hasActiveFilters || searchTerm || (activeKpi && activeKpi !== 'total')
              ? <>Downloads the <b>{totalCount.toLocaleString('en-IN')}</b> enrollment{totalCount === 1 ? '' : 's'} in your filtered list (same filters{searchTerm ? ' and search' : ''} as on screen).</>
              : <>No filters are applied, so this exports <b>all {totalCount.toLocaleString('en-IN')}</b> enrollments you can see.</>}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
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
