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
import InputAdornment from '@mui/material/InputAdornment';
import { format, isToday, parseISO } from 'date-fns';
import { toast } from 'react-toastify';
import { useAuthStore } from '../stores/authStore';
import { formatShortDateIST } from '../utils/dateUtils';
import { enrollmentService } from '../services/enrollmentService';
import {
  Enrollment,
  EnrollmentStatsResponse,
  CONNECT_STATUS_OPTIONS,
  ACTION_TAKEN_OPTIONS,
  SERVICE_PARTNER_OPTIONS,
} from '../types/enrollment.types';
import EnrollmentViewModal from '../components/enrollments/EnrollmentViewModal';
import EnrollmentCreateModal from '../components/enrollments/EnrollmentCreateModal';
import BulkUploadModal from '../components/enrollments/BulkUploadModal';
import api from '../services/api';
import { brandColors } from '../theme';

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
  if (!dateString) return false;
  try {
    const date = parseISO(dateString);
    return isToday(date);
  } catch {
    return false;
  }
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
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
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
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Filters - multi-select arrays
  const [connectStatusFilter, setConnectStatusFilter] = useState<string[]>([]);
  const [actionTakenFilter, setActionTakenFilter] = useState<string[]>([]);
  const [servicePartnerFilter, setServicePartnerFilter] = useState<string[]>([]);
  const [uhidFilter, setUhidFilter] = useState<string[]>([]);
  const [hclhcSpocFilter, setHclhcSpocFilter] = useState('');

  // Debounce search input → searchTerm (350ms)
  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);
  const [createdDateFrom, setCreatedDateFrom] = useState<Date | null>(null);
  const [createdDateTo, setCreatedDateTo] = useState<Date | null>(null);
  const [nextFollowUpDateFilter, setNextFollowUpDateFilter] = useState<Date | null>(null);
  const [colorFilter, setColorFilter] = useState<string>(''); // 'filled' or 'not_filled' or ''
  const [showFilters, setShowFilters] = useState(true);
  const [allUhids, setAllUhids] = useState<string[]>([]);
  const [tulipUsers, setTulipUsers] = useState<UserOption[]>([]);

  // Check if any filter is active
  const hasActiveFilters = connectStatusFilter.length > 0 || actionTakenFilter.length > 0 || servicePartnerFilter.length > 0 || uhidFilter.length > 0 || hclhcSpocFilter || createdDateFrom || createdDateTo || nextFollowUpDateFilter || colorFilter;

  // Get total number of active filter values
  const activeFilterCount = connectStatusFilter.length + actionTakenFilter.length + servicePartnerFilter.length + uhidFilter.length + (hclhcSpocFilter ? 1 : 0) + (createdDateFrom || createdDateTo ? 1 : 0) + (nextFollowUpDateFilter ? 1 : 0) + (colorFilter ? 1 : 0);

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

  // View mode toggle: 'all' for all enrollments, 'user' for user-level view
  const [viewMode, setViewMode] = useState<'all' | 'user'>('all');
  const [expandedUsers, setExpandedUsers] = useState<string[]>([]);

  // Filter enrollments by color filter (client-side filter for highlight status)
  const filteredEnrollments = useMemo(() => {
    if (!colorFilter) return enrollments;

    if (colorFilter === 'filled') {
      return enrollments.filter(e => shouldHighlightForAgent(e));
    } else if (colorFilter === 'not_filled') {
      return enrollments.filter(e => !shouldHighlightForAgent(e));
    }
    return enrollments;
  }, [enrollments, colorFilter]);

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

  const groupedByUser = useMemo((): UserGroup[] => {
    const groups: Record<string, UserGroup> = {};
    // Filter by UHID if filter is active
    const uhidFilteredEnrollments = uhidFilter.length > 0
      ? filteredEnrollments.filter(e => e.uhid && uhidFilter.includes(e.uhid))
      : filteredEnrollments;

    uhidFilteredEnrollments.forEach((enrollment) => {
      const uhid = enrollment.uhid || 'Unknown';
      if (!groups[uhid]) {
        groups[uhid] = {
          uhid,
          subscriber_name: enrollment.subscriber_name || '',
          phone_number: enrollment.phone_number || '',
          email: enrollment.email || '',
          employee_id: enrollment.employee_id || '',
          enrollments: [],
          total_enrollments: 0,
        };
      }
      groups[uhid].enrollments.push(enrollment);
      groups[uhid].total_enrollments++;
      // Update user info if this enrollment has more complete data
      if (!groups[uhid].subscriber_name && enrollment.subscriber_name) {
        groups[uhid].subscriber_name = enrollment.subscriber_name;
      }
      if (!groups[uhid].phone_number && enrollment.phone_number) {
        groups[uhid].phone_number = enrollment.phone_number;
      }
      if (!groups[uhid].email && enrollment.email) {
        groups[uhid].email = enrollment.email;
      }
    });
    return Object.values(groups).sort((a, b) => b.total_enrollments - a.total_enrollments);
  }, [filteredEnrollments, uhidFilter]);

  // Compute user-level stats
  const userLevelStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const uniqueUhids = new Set<string>();
    const usersEnrolledToday = new Set<string>();

    filteredEnrollments.forEach(enrollment => {
      if (enrollment.uhid) {
        uniqueUhids.add(enrollment.uhid);
        const createdDate = new Date(enrollment.created_at);
        createdDate.setHours(0, 0, 0, 0);
        if (createdDate.getTime() === today.getTime()) {
          usersEnrolledToday.add(enrollment.uhid);
        }
      }
    });

    return {
      totalUsers: uniqueUhids.size,
      usersEnrolledToday: usersEnrolledToday.size,
      totalEnrollments: filteredEnrollments.length,
    };
  }, [filteredEnrollments]);

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

  const fetchEnrollments = useCallback(async () => {
    setLoading(true);
    try {
      const response = await enrollmentService.getEnrollments({
        page: paginationModel.page + 1,
        per_page: paginationModel.pageSize,
        search: searchTerm || undefined,
        connect_status: connectStatusFilter.length > 0 ? connectStatusFilter : undefined,
        action_taken: actionTakenFilter.length > 0 ? actionTakenFilter : undefined,
        service_partner: servicePartnerFilter.length > 0 ? servicePartnerFilter : undefined,
        uhid: uhidFilter.length > 0 ? uhidFilter : undefined,
        hclhc_spoc: hclhcSpocFilter || undefined,
        created_date_from: createdDateFrom ? format(createdDateFrom, 'yyyy-MM-dd') : undefined,
        created_date_to: createdDateTo ? format(createdDateTo, 'yyyy-MM-dd') : undefined,
        next_follow_up_date: nextFollowUpDateFilter ? format(nextFollowUpDateFilter, 'yyyy-MM-dd') : undefined,
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
  }, [paginationModel, searchTerm, connectStatusFilter, actionTakenFilter, servicePartnerFilter, uhidFilter, hclhcSpocFilter, createdDateFrom, createdDateTo, nextFollowUpDateFilter]);

  // Reset to page 0 whenever filters/search change so user isn't stranded on a now-empty page
  useEffect(() => {
    setPaginationModel(prev => prev.page === 0 ? prev : { ...prev, page: 0 });
  }, [searchTerm, connectStatusFilter, actionTakenFilter, servicePartnerFilter, uhidFilter, hclhcSpocFilter, createdDateFrom, createdDateTo, nextFollowUpDateFilter]);

  useEffect(() => {
    fetchEnrollments();
    fetchStats();
  }, [fetchEnrollments, fetchStats]);

  // Fetch users tagged for Tulip CRM for HCLHC SPOC dropdown
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

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await enrollmentService.exportExcel();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `enrollments_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Export downloaded successfully');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export enrollments');
    } finally {
      setExporting(false);
    }
  };

  const columns: GridColDef[] = [
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
      headerName: 'Next Follow Up',
      flex: 0.8,
      minWidth: 95,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.value) return '-';
        return formatShortDateIST(params.value as string);
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
  ];

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
            <IconButton onClick={() => { fetchEnrollments(); fetchStats(); }} color="primary" size="small">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          {isAdmin && (
            <>
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={handleExport}
                disabled={exporting}
                size="small"
              >
                {exporting ? 'Exporting...' : 'Export'}
              </Button>
              <Button
                variant="outlined"
                startIcon={<UploadIcon />}
                onClick={() => setBulkUploadModalOpen(true)}
                size="small"
              >
                Bulk Upload
              </Button>
            </>
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
          <Grid item xs={6} sm={3} sx={{ display: 'flex' }}>
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
                    <Typography color="text.secondary" variant="body2" sx={{ mb: 0.25 }}>
                      Total Enrollments
                    </Typography>
                    <Typography color="text.secondary" variant="caption" sx={{ display: 'block', mb: 0.5 }}>
                      Assigned or Reassigned
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 600, color: '#1a1a2e' }}>
                      {stats.total}
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
          <Grid item xs={6} sm={3} sx={{ display: 'flex' }}>
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
                    <Typography color="text.secondary" variant="body2" sx={{ mb: 0.25 }}>
                      New Enrollments Today
                    </Typography>
                    <Typography color="text.secondary" variant="caption" sx={{ display: 'block', mb: 0.5 }}>
                      Assigned Today
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 600, color: '#1a1a2e' }}>
                      {stats.new_today}
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
          <Grid item xs={6} sm={3} sx={{ display: 'flex' }}>
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
                    <Typography color="text.secondary" variant="body2" sx={{ mb: 0.25 }}>
                      Enrollments Assigned Today
                    </Typography>
                    <Typography color="text.secondary" variant="caption" sx={{ display: 'block', mb: 0.5 }}>
                      All Assignments
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 600, color: '#1a1a2e' }}>
                      {stats.assigned_today}
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
                    <Typography sx={{ color: '#f57c00', fontSize: '1.2rem' }}>*</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={3} sx={{ display: 'flex' }}>
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
                    <Typography color="text.secondary" variant="body2" sx={{ mb: 0.25 }}>
                      Follow-ups Today
                    </Typography>
                    <Typography color="text.secondary" variant="caption" sx={{ display: 'block', mb: 0.5 }}>
                      Enrollments
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 600, color: '#1a1a2e' }}>
                      {stats.follow_up_today}
                    </Typography>
                  </Box>
                  <Box sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #fce4ec 0%, #f8bbd9 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Typography sx={{ color: '#c2185b', fontSize: '1.2rem' }}>!</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      ) : stats && isAdmin && (
        /* Admin Stats Cards - 3 cards */
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
                      Total Enrollments
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 600, color: '#1a1a2e' }}>
                      {stats.total}
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
                    <Typography sx={{ color: '#1976d2', fontSize: '1.2rem' }}>#</Typography>
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
                      Enrollments Created Today
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 600, color: '#1a1a2e' }}>
                      {stats.new_today}
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
                      Follow-ups Today
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 600, color: '#1a1a2e' }}>
                      {stats.follow_up_today}
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
                    <Typography sx={{ color: '#f57c00', fontSize: '1.2rem' }}>!</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
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
                    setConnectStatusFilter([]);
                    setActionTakenFilter([]);
                    setServicePartnerFilter([]);
                    setUhidFilter([]);
                    setHclhcSpocFilter('');
                    setCreatedDateFrom(null);
                    setCreatedDateTo(null);
                    setNextFollowUpDateFilter(null);
                    setColorFilter('');
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
                  options={CONNECT_STATUS_OPTIONS}
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
                  options={ACTION_TAKEN_OPTIONS}
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
                  options={SERVICE_PARTNER_OPTIONS}
                  value={servicePartnerFilter}
                  onChange={(_, newValue) => setServicePartnerFilter(newValue)}
                  renderInput={(params) => (
                    <TextField {...params} label="Service Partner" placeholder="" sx={{ ...compactInputSx, width: 135 }} />
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
                    <TextField {...params} label="UHID" placeholder="Type & Enter" sx={{ ...compactInputSx, width: 140 }} />
                  )}
                  renderTags={() => null}
                  disableCloseOnSelect
                />

                {/* HCLHC SPOC - User dropdown */}
                <Autocomplete
                  size="small"
                  options={tulipUsers}
                  getOptionLabel={(option) => option.full_name}
                  value={tulipUsers.find(u => u.full_name === hclhcSpocFilter) || null}
                  onChange={(_, newValue) => setHclhcSpocFilter(newValue?.full_name || '')}
                  renderInput={(params) => (
                    <TextField {...params} label="HCLHC SPOC" placeholder="" sx={{ ...compactInputSx, width: 150 }} />
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

                {/* Next Follow Up Date */}
                <DatePicker
                  label="Next Follow Up"
                  value={nextFollowUpDateFilter}
                  onChange={setNextFollowUpDateFilter}
                  slotProps={{
                    textField: { size: 'small', sx: { ...compactInputSx, width: 140 } },
                    field: { clearable: true }
                  }}
                />

                {/* Color Filter - only shown for agents */}
                {!isAdmin && (
                  <Autocomplete
                    size="small"
                    options={[
                      { value: 'filled', label: 'Filled (Yellow)' },
                      { value: 'not_filled', label: 'Not Filled' },
                    ]}
                    getOptionLabel={(option) => option.label}
                    value={colorFilter ? { value: colorFilter, label: colorFilter === 'filled' ? 'Filled (Yellow)' : 'Not Filled' } : null}
                    onChange={(_, newValue) => setColorFilter(newValue?.value || '')}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Color"
                        placeholder=""
                        sx={{
                          ...compactInputSx,
                          width: 130,
                          '& .MuiOutlinedInput-root': {
                            bgcolor: colorFilter === 'filled' ? '#fff9c4' : 'white',
                          },
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
                      <Typography sx={{ fontSize: '0.7rem', color: 'primary.dark', fontWeight: 600 }}>SPOC: {hclhcSpocFilter}</Typography>
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
                        Follow Up: {format(nextFollowUpDateFilter, 'dd/MM/yy')}
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
                        Color: {colorFilter === 'filled' ? 'Filled (Yellow)' : 'Not Filled'}
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
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <Typography color="text.secondary">Loading...</Typography>
            </Box>
          ) : groupedByUser.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <Typography color="text.secondary">No enrollments found</Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Showing {groupedByUser.length} unique users with {filteredEnrollments.length} enrollments
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
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Follow Up</TableCell>
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
    </Box>
  );
}
