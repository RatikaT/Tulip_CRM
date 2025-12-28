import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  MenuItem,
  Grid,
  Chip,
  IconButton,
  Tooltip,
  Card,
  CardContent,
} from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { useAuthStore } from '../stores/authStore';
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
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [paginationModel, setPaginationModel] = useState({
    page: 0,
    pageSize: 25,
  });

  // Stats
  const [stats, setStats] = useState<EnrollmentStatsResponse | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [connectStatusFilter, setConnectStatusFilter] = useState('');
  const [actionTakenFilter, setActionTakenFilter] = useState('');
  const [servicePartnerFilter, setServicePartnerFilter] = useState('');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [bulkUploadModalOpen, setBulkUploadModalOpen] = useState(false);
  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);

  // Export state
  const [exporting, setExporting] = useState(false);

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
        search: search || undefined,
        connect_status: connectStatusFilter || undefined,
        action_taken: actionTakenFilter || undefined,
        service_partner: servicePartnerFilter || undefined,
      });
      setEnrollments(response.enrollments);
      setTotalCount(response.total);
    } catch (error) {
      console.error('Failed to fetch enrollments:', error);
      toast.error('Failed to load enrollments');
    } finally {
      setLoading(false);
    }
  }, [paginationModel, search, connectStatusFilter, actionTakenFilter, servicePartnerFilter]);

  useEffect(() => {
    fetchEnrollments();
    fetchStats();
  }, [fetchEnrollments, fetchStats]);

  const handleViewEnrollment = (enrollment: Enrollment) => {
    setSelectedEnrollment(enrollment);
    setViewModalOpen(true);
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
      headerName: 'Subscriber',
      flex: 1,
      minWidth: 100,
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
      headerName: 'Phone',
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
      field: 'follow_up_date',
      headerName: 'Follow Up',
      flex: 0.7,
      minWidth: 80,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.value) return '-';
        return format(new Date(params.value as string), 'dd/MM/yy');
      },
    },
    {
      field: 'billed_date',
      headerName: 'Billed',
      flex: 0.7,
      minWidth: 80,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.value) return '-';
        return format(new Date(params.value as string), 'dd/MM/yy');
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
        return format(new Date(params.value as string), 'dd/MM/yy');
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

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          Enrollments
        </Typography>
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
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setCreateModalOpen(true)}
                size="small"
              >
                Add Enrollment
              </Button>
            </>
          )}
        </Box>
      </Box>

      {/* Stats Cards */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} sm={4}>
            <Card>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography color="text.secondary" variant="body2">
                  Total Enrollments
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 600, color: 'primary.main' }}>
                  {stats.total}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography color="text.secondary" variant="body2" sx={{ mb: 0.5 }}>
                  By Service Partner
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {Object.entries(stats.by_partner).slice(0, 4).map(([partner, count]) => (
                    <Chip
                      key={partner}
                      label={`${partner}: ${count}`}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.7rem' }}
                    />
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography color="text.secondary" variant="body2" sx={{ mb: 0.5 }}>
                  By Connect Status
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {Object.entries(stats.by_status).map(([status, count]) => (
                    <Chip
                      key={status}
                      label={`${status}: ${count}`}
                      size="small"
                      color={connectStatusColors[status] || 'default'}
                      sx={{ fontSize: '0.7rem' }}
                    />
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Filters */}
      <Paper sx={{ p: 1.5, mb: 2 }}>
        <Grid container spacing={1.5} alignItems="center">
          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              size="small"
              label="Search"
              placeholder="Employee code, name, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField
              fullWidth
              size="small"
              select
              label="Connect Status"
              value={connectStatusFilter}
              onChange={(e) => setConnectStatusFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {CONNECT_STATUS_OPTIONS.map((status) => (
                <MenuItem key={status} value={status}>
                  {status}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField
              fullWidth
              size="small"
              select
              label="Action Taken"
              value={actionTakenFilter}
              onChange={(e) => setActionTakenFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {ACTION_TAKEN_OPTIONS.map((action) => (
                <MenuItem key={action} value={action}>
                  {action}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField
              fullWidth
              size="small"
              select
              label="Service Partner"
              value={servicePartnerFilter}
              onChange={(e) => setServicePartnerFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {SERVICE_PARTNER_OPTIONS.map((partner) => (
                <MenuItem key={partner} value={partner}>
                  {partner}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Button
              fullWidth
              variant="outlined"
              size="small"
              onClick={() => {
                setSearch('');
                setConnectStatusFilter('');
                setActionTakenFilter('');
                setServicePartnerFilter('');
              }}
            >
              Clear Filters
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Data Grid */}
      <Paper sx={{ height: 'calc(100vh - 380px)', minHeight: 400 }}>
        <DataGrid
          rows={enrollments}
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
          sx={{
            border: 'none',
            fontSize: '0.85rem',
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: '#f5f5f5',
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
          }}
          onRowClick={(params) => handleViewEnrollment(params.row as Enrollment)}
        />
      </Paper>

      {/* Create Modal */}
      {isAdmin && (
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
