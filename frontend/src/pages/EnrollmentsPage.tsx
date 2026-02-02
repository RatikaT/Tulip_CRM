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
} from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
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

interface UserOption {
  id: string;
  full_name: string;
  role: string;
}

const connectStatusColors: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  'Connected': 'success',
  'No Response': 'warning',
  'Follow Up Required': 'primary',
  'Others': 'default',
};

const actionTakenColors: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  'Appointment Booked': 'success',
  'Feedback Taken': 'info',
  'No Action Required': 'default',
  'Liasoned with Partner Team': 'primary',
};

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

  // Filters - multi-select arrays
  const [connectStatusFilter, setConnectStatusFilter] = useState<string[]>([]);
  const [actionTakenFilter, setActionTakenFilter] = useState<string[]>([]);
  const [servicePartnerFilter, setServicePartnerFilter] = useState<string[]>([]);
  const [uhidFilter, setUhidFilter] = useState<string[]>([]);
  const [hclhcSpocFilter, setHclhcSpocFilter] = useState('');
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
        connect_status: connectStatusFilter.length > 0 ? connectStatusFilter : undefined,
        action_taken: actionTakenFilter.length > 0 ? actionTakenFilter : undefined,
        service_partner: servicePartnerFilter.length > 0 ? servicePartnerFilter : undefined,
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
  }, [paginationModel, connectStatusFilter, actionTakenFilter, servicePartnerFilter, hclhcSpocFilter, createdDateFrom, createdDateTo, nextFollowUpDateFilter]);

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
            color={connectStatusColors[params.value as string] || 'default'}
            sx={{
              fontWeight: 500,
              fontSize: '0.7rem',
              height: 24,
            }}
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
            color={actionTakenColors[params.value as string] || 'default'}
            variant="outlined"
            sx={{
              fontWeight: 500,
              fontSize: '0.65rem',
              height: 24,
            }}
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
      width: 60,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => (
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
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
              borderRadius: 1.5,
              border: '1px solid #f0f0f0',
              width: '100%',
              minHeight: 100,
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
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
              borderRadius: 1.5,
              border: '1px solid #f0f0f0',
              width: '100%',
              minHeight: 100,
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
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
              borderRadius: 1.5,
              border: '1px solid #f0f0f0',
              width: '100%',
              minHeight: 100,
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
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
              borderRadius: 1.5,
              border: '1px solid #f0f0f0',
              width: '100%',
              minHeight: 100,
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
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
              borderRadius: 1.5,
              border: '1px solid #f0f0f0',
              width: '100%',
              minHeight: 100,
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
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
              borderRadius: 1.5,
              border: '1px solid #f0f0f0',
              width: '100%',
              minHeight: 100,
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
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
              borderRadius: 1.5,
              border: '1px solid #f0f0f0',
              width: '100%',
              minHeight: 100,
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
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
              borderRadius: 1.5,
              border: '1px solid #f0f0f0',
              width: '100%',
              minHeight: 100,
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
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
              borderRadius: 1.5,
              border: '1px solid #f0f0f0',
              width: '100%',
              minHeight: 100,
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
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
              borderRadius: 1.5,
              border: '1px solid #f0f0f0',
              width: '100%',
              minHeight: 100,
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

      {/* Filters Section */}
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <Paper
          sx={{
            mb: 2,
            border: '1px solid #e0e0e0',
            borderRadius: 1,
            overflow: 'hidden',
          }}
        >
          {/* Filter Header */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 1.5,
              py: 0.75,
              bgcolor: '#fafafa',
              borderBottom: showFilters ? '1px solid #e0e0e0' : 'none',
              cursor: 'pointer',
            }}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <FilterListIcon sx={{ color: 'primary.main', fontSize: 16 }} />
              <Typography sx={{ fontWeight: 600, color: '#333', fontSize: '0.75rem' }}>
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
            <Box sx={{ p: 1.5 }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
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

                {/* UHID - Multi-select */}
                <Autocomplete
                  multiple
                  size="small"
                  options={allUhids}
                  value={uhidFilter}
                  onChange={(_, newValue) => setUhidFilter(newValue)}
                  renderInput={(params) => (
                    <TextField {...params} label="UHID" placeholder="" sx={{ ...compactInputSx, width: 120 }} />
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
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.25, cursor: 'pointer' }}
                      onClick={() => setConnectStatusFilter(prev => prev.filter(s => s !== status))}
                    >
                      <Typography sx={{ fontSize: '0.7rem', color: 'error.main' }}>{status}</Typography>
                      <CloseIcon sx={{ fontSize: 12, color: 'error.main' }} />
                    </Box>
                  ))}
                  {actionTakenFilter.map((action) => (
                    <Box
                      key={`action-${action}`}
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.25, cursor: 'pointer' }}
                      onClick={() => setActionTakenFilter(prev => prev.filter(a => a !== action))}
                    >
                      <Typography sx={{ fontSize: '0.7rem', color: 'error.main' }}>{action}</Typography>
                      <CloseIcon sx={{ fontSize: 12, color: 'error.main' }} />
                    </Box>
                  ))}
                  {servicePartnerFilter.map((partner) => (
                    <Box
                      key={`partner-${partner}`}
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.25, cursor: 'pointer' }}
                      onClick={() => setServicePartnerFilter(prev => prev.filter(p => p !== partner))}
                    >
                      <Typography sx={{ fontSize: '0.7rem', color: 'error.main' }}>{partner}</Typography>
                      <CloseIcon sx={{ fontSize: 12, color: 'error.main' }} />
                    </Box>
                  ))}
                  {uhidFilter.map((uhid) => (
                    <Box
                      key={`uhid-${uhid}`}
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.25, cursor: 'pointer' }}
                      onClick={() => setUhidFilter(prev => prev.filter(u => u !== uhid))}
                    >
                      <Typography sx={{ fontSize: '0.7rem', color: 'error.main' }}>UHID: {uhid}</Typography>
                      <CloseIcon sx={{ fontSize: 12, color: 'error.main' }} />
                    </Box>
                  ))}
                  {hclhcSpocFilter && (
                    <Box
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.25, cursor: 'pointer' }}
                      onClick={() => setHclhcSpocFilter('')}
                    >
                      <Typography sx={{ fontSize: '0.7rem', color: 'error.main' }}>SPOC: {hclhcSpocFilter}</Typography>
                      <CloseIcon sx={{ fontSize: 12, color: 'error.main' }} />
                    </Box>
                  )}
                  {(createdDateFrom || createdDateTo) && (
                    <Box
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.25, cursor: 'pointer' }}
                      onClick={() => { setCreatedDateFrom(null); setCreatedDateTo(null); }}
                    >
                      <Typography sx={{ fontSize: '0.7rem', color: 'error.main' }}>
                        Created: {createdDateFrom ? format(createdDateFrom, 'dd/MM/yy') : '...'} - {createdDateTo ? format(createdDateTo, 'dd/MM/yy') : '...'}
                      </Typography>
                      <CloseIcon sx={{ fontSize: 12, color: 'error.main' }} />
                    </Box>
                  )}
                  {nextFollowUpDateFilter && (
                    <Box
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.25, cursor: 'pointer' }}
                      onClick={() => setNextFollowUpDateFilter(null)}
                    >
                      <Typography sx={{ fontSize: '0.7rem', color: 'error.main' }}>
                        Follow Up: {format(nextFollowUpDateFilter, 'dd/MM/yy')}
                      </Typography>
                      <CloseIcon sx={{ fontSize: 12, color: 'error.main' }} />
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
                      <Typography sx={{ fontSize: '0.7rem', color: 'error.main' }}>
                        Color: {colorFilter === 'filled' ? 'Filled (Yellow)' : 'Not Filled'}
                      </Typography>
                      <CloseIcon sx={{ fontSize: 12, color: 'error.main' }} />
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
        <Paper sx={{ height: 'calc(100vh - 380px)', minHeight: 400 }}>
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
            rowHeight={52}
            getRowClassName={(params) => {
              // Only highlight for agents (non-admins)
              if (!isAdmin && shouldHighlightForAgent(params.row as Enrollment)) {
                return 'highlight-row';
              }
              return '';
            }}
            sx={{
              border: 'none',
              fontSize: '0.85rem',
              '& .MuiDataGrid-columnHeaders, & .MuiDataGrid-columnHeader, & .MuiDataGrid-columnHeadersInner, & .MuiDataGrid-columnHeaderRow': {
                backgroundColor: '#d6e0ec !important',
                fontSize: '0.8rem',
                fontWeight: 600,
              },
              '& .MuiDataGrid-columnHeaderTitle': {
                whiteSpace: 'normal',
                lineHeight: 1.2,
                textAlign: 'center',
              },
              '& .MuiDataGrid-cell': {
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
              },
              '& .MuiDataGrid-cell:focus': {
                outline: 'none',
              },
              '& .MuiDataGrid-row': {
                borderBottom: '1px solid #e0e0e0',
              },
              '& .MuiDataGrid-row:hover': {
                backgroundColor: '#f8f9fa',
                cursor: 'pointer',
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
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', width: 60 }}>Action</TableCell>
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
                                  color={connectStatusColors[enrollment.connect_status] || 'default'}
                                  sx={{ fontSize: '0.65rem', height: 22 }}
                                />
                              ) : '-'}
                            </TableCell>
                            <TableCell>
                              {enrollment.action_taken ? (
                                <Chip
                                  label={enrollment.action_taken}
                                  size="small"
                                  color={actionTakenColors[enrollment.action_taken] || 'default'}
                                  variant="outlined"
                                  sx={{ fontSize: '0.65rem', height: 22 }}
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
    </Box>
  );
}
