import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
} from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { useAuthStore } from '../stores/authStore';
import { leadService } from '../services/leadService';
import { Lead, LEAD_STATUS_OPTIONS, LEAD_SOURCE_OPTIONS } from '../types/lead.types';
import LeadCreateModal from '../components/leads/LeadCreateModal';
import api from '../services/api';

interface UserOption {
  id: string;
  full_name: string;
  role: string;
}

const statusColors: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  'New': 'info',
  'Not Interested': 'error',
  'Interested': 'success',
  'Lead Closed - No Response': 'default',
  'No Response': 'warning',
  'FollowUp Required': 'primary',
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

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [agents, setAgents] = useState<UserOption[]>([]);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Export state
  const [exporting, setExporting] = useState(false);

  // Fetch agents/users for filter
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const response = await api.get<{ users: UserOption[] }>('/users');
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
        search: search || undefined,
        status: statusFilter || undefined,
        lead_source: sourceFilter || undefined,
        assigned_to: agentFilter || undefined,
      });
      setLeads(response.leads);
      setTotalCount(response.total);
    } catch (error) {
      console.error('Failed to fetch leads:', error);
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [paginationModel, search, statusFilter, sourceFilter, agentFilter]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleViewLead = (lead: Lead) => {
    navigate(`/tulip/leads/${lead.lead_id}`);
  };

  const handleCreateSuccess = () => {
    setCreateModalOpen(false);
    fetchLeads();
    toast.success('Lead created successfully');
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await api.get('/leads/export/excel', {
        responseType: 'blob',
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
          color={statusColors[params.value as string] || 'default'}
          sx={{
            fontWeight: 500,
            fontSize: '0.7rem',
            height: 24,
          }}
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
        return format(new Date(params.value as string), 'dd/MM/yy');
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
      field: 'stage',
      headerName: 'Stage',
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
      field: 'service_enrolled',
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
        return format(new Date(params.value as string), 'dd/MM/yy');
      },
    },
    {
      field: 'updated_at',
      headerName: 'Updated',
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
              handleViewLead(params.row as Lead);
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
          Leads
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Refresh">
            <IconButton onClick={fetchLeads} color="primary" size="small">
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
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setCreateModalOpen(true)}
                size="small"
              >
                Add Lead
              </Button>
            </>
          )}
        </Box>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 1.5, mb: 2 }}>
        <Grid container spacing={1.5} alignItems="center">
          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              size="small"
              label="Search"
              placeholder="Name, phone, lead ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField
              fullWidth
              size="small"
              select
              label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {LEAD_STATUS_OPTIONS.map((status) => (
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
              label="Source"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {LEAD_SOURCE_OPTIONS.map((source) => (
                <MenuItem key={source} value={source}>
                  {source}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField
              fullWidth
              size="small"
              select
              label="Agent"
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
            >
              <MenuItem value="">All Agents</MenuItem>
              {agents.map((agent) => (
                <MenuItem key={agent.id} value={agent.id}>
                  {agent.full_name}
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
                setStatusFilter('');
                setSourceFilter('');
                setAgentFilter('');
              }}
            >
              Clear Filters
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Data Grid */}
      <Paper sx={{ height: 'calc(100vh - 280px)', minHeight: 400 }}>
        <DataGrid
          rows={leads}
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
          onRowClick={(params) => handleViewLead(params.row as Lead)}
        />
      </Paper>

      {/* Create Modal */}
      {isAdmin && (
        <LeadCreateModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
    </Box>
  );
}
