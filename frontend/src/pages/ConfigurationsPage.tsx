import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Tooltip,
  Chip,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  CircularProgress,
  Alert,
  alpha,
} from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import SettingsIcon from '@mui/icons-material/Settings';
import CloseIcon from '@mui/icons-material/Close';
import GroupIcon from '@mui/icons-material/Group';
import TuneIcon from '@mui/icons-material/Tune';
import ListIcon from '@mui/icons-material/List';
import { toast } from 'react-toastify';
import api from '../services/api';
import { User } from '../types/user.types';
import { customFieldService } from '../services/customFieldService';
import {
  CustomField,
  CustomFieldCreate,
  FieldType,
  FIELD_TYPES,
} from '../types/custom-field.types';
import UserCreateModal from '../components/users/UserCreateModal';
import UserEditModal from '../components/users/UserEditModal';
import DropdownOptionsTab from '../components/configurations/DropdownOptionsTab';
import { brandColors } from '../theme';

const colors = {
  primary: brandColors.navyBlue,
  primaryLight: alpha(brandColors.navyBlue, 0.08),
  accent: brandColors.orange,
  success: '#10b981',
  successLight: '#d1fae5',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  error: '#ef4444',
  errorLight: '#fee2e2',
  textPrimary: '#1e293b',
  textSecondary: '#64748b',
  border: '#e2e8f0',
  background: '#f8fafc',
};

const cardShadow = '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)';

// Soft pill style for status / role chips
const softChip = (hex: string) => ({
  bgcolor: `${hex}1A`,
  color: hex,
  fontWeight: 600,
  fontSize: '0.7rem',
  height: 24,
  borderRadius: '8px',
  border: `1px solid ${hex}33`,
  '& .MuiChip-label': { px: 1 },
});

const chipHex = {
  navy: '#1E4088',
  green: '#0f8a63',
  purple: '#7B4B94',
  amber: '#b26a00',
  slate: '#475569',
};

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`config-tabpanel-${index}`}
      aria-labelledby={`config-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

interface FieldFormData {
  field_name: string;
  field_label: string;
  field_type: FieldType;
  is_required: boolean;
  dropdown_options: string[];
  visible_to_agents: boolean;
  display_order: number;
}

const initialFormData: FieldFormData = {
  field_name: '',
  field_label: '',
  field_type: 'text',
  is_required: false,
  dropdown_options: [],
  visible_to_agents: true,
  display_order: 0,
};

export default function ConfigurationsPage() {
  const [tabValue, setTabValue] = useState(0);

  // Users state
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [editUserModalOpen, setEditUserModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Custom Fields state
  const [fields, setFields] = useState<CustomField[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(true);
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<CustomField | null>(null);
  const [formData, setFormData] = useState<FieldFormData>(initialFormData);
  const [dropdownInput, setDropdownInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Fetch Users
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const response = await api.get<{ users: User[]; total: number }>('/users');
      setUsers(response.data.users);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      toast.error('Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // Fetch Custom Fields
  const fetchFields = useCallback(async () => {
    setFieldsLoading(true);
    try {
      const response = await customFieldService.getFields(false);
      setFields(response.fields);
    } catch (error) {
      console.error('Failed to fetch custom fields:', error);
      toast.error('Failed to load custom fields');
    } finally {
      setFieldsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchFields();
  }, [fetchUsers, fetchFields]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // User handlers
  const handleCreateUserSuccess = () => {
    setCreateUserModalOpen(false);
    fetchUsers();
    toast.success('User created successfully');
  };

  const handleEditUserClick = (user: User) => {
    setSelectedUser(user);
    setEditUserModalOpen(true);
  };

  const handleEditUserSuccess = () => {
    setEditUserModalOpen(false);
    setSelectedUser(null);
    fetchUsers();
    toast.success('User updated successfully');
  };

  // Custom Field handlers
  const handleOpenFieldDialog = (field?: CustomField) => {
    if (field) {
      setSelectedField(field);
      setFormData({
        field_name: field.field_name,
        field_label: field.field_label,
        field_type: field.field_type,
        is_required: field.is_required,
        dropdown_options: field.dropdown_options,
        visible_to_agents: field.visible_to_agents,
        display_order: field.display_order,
      });
    } else {
      setSelectedField(null);
      setFormData({
        ...initialFormData,
        display_order: fields.length,
      });
    }
    setDropdownInput('');
    setFormError('');
    setFieldDialogOpen(true);
  };

  const handleCloseFieldDialog = () => {
    setFieldDialogOpen(false);
    setSelectedField(null);
    setFormData(initialFormData);
    setFormError('');
  };

  const handleAddDropdownOption = () => {
    const option = dropdownInput.trim();
    if (option && !formData.dropdown_options.includes(option)) {
      setFormData({
        ...formData,
        dropdown_options: [...formData.dropdown_options, option],
      });
      setDropdownInput('');
    }
  };

  const handleRemoveDropdownOption = (option: string) => {
    setFormData({
      ...formData,
      dropdown_options: formData.dropdown_options.filter((o) => o !== option),
    });
  };

  const validateForm = (): boolean => {
    if (!formData.field_label.trim()) {
      setFormError('Field label is required');
      return false;
    }
    if (!selectedField && !formData.field_name.trim()) {
      setFormError('Field name is required');
      return false;
    }
    if (!selectedField) {
      const nameRegex = /^[a-z][a-z0-9_]*$/;
      if (!nameRegex.test(formData.field_name)) {
        setFormError('Field name must start with a lowercase letter and contain only lowercase letters, numbers, and underscores');
        return false;
      }
    }
    if (formData.field_type === 'dropdown' && formData.dropdown_options.length === 0) {
      setFormError('Dropdown fields must have at least one option');
      return false;
    }
    return true;
  };

  const handleSaveField = async () => {
    if (!validateForm()) return;
    setSaving(true);
    setFormError('');
    try {
      if (selectedField) {
        await customFieldService.updateField(selectedField.id, {
          field_label: formData.field_label,
          is_required: formData.is_required,
          dropdown_options: formData.dropdown_options,
          visible_to_agents: formData.visible_to_agents,
          display_order: formData.display_order,
        });
        toast.success('Custom field updated successfully');
      } else {
        const createData: CustomFieldCreate = {
          field_name: formData.field_name,
          field_label: formData.field_label,
          field_type: formData.field_type,
          is_required: formData.is_required,
          dropdown_options: formData.dropdown_options,
          visible_to_agents: formData.visible_to_agents,
          display_order: formData.display_order,
        };
        await customFieldService.createField(createData);
        toast.success('Custom field created successfully');
      }
      handleCloseFieldDialog();
      fetchFields();
    } catch (error: unknown) {
      console.error('Failed to save custom field:', error);
      const err = error as { response?: { data?: { detail?: string } } };
      const message = err.response?.data?.detail || 'Failed to save custom field';
      setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteField = async () => {
    if (!selectedField) return;
    try {
      await customFieldService.deleteField(selectedField.id);
      toast.success('Custom field deleted successfully');
      setDeleteDialogOpen(false);
      setSelectedField(null);
      fetchFields();
    } catch (error) {
      console.error('Failed to delete custom field:', error);
      toast.error('Failed to delete custom field');
    }
  };

  const handleToggleFieldActive = async (field: CustomField) => {
    try {
      await customFieldService.updateField(field.id, { is_active: !field.is_active });
      toast.success(`Field ${field.is_active ? 'deactivated' : 'activated'}`);
      fetchFields();
    } catch (error) {
      console.error('Failed to toggle field status:', error);
      toast.error('Failed to update field status');
    }
  };

  const getFieldTypeLabel = (type: FieldType): string => {
    return FIELD_TYPES.find((t) => t.value === type)?.label || type;
  };

  // User columns
  const userColumns: GridColDef[] = [
    { field: 'full_name', headerName: 'Name', width: 200, flex: 1 },
    { field: 'email', headerName: 'Email', width: 250 },
    { field: 'username', headerName: 'Username', width: 150 },
    {
      field: 'role',
      headerName: 'Role',
      width: 120,
      renderCell: (params: GridRenderCellParams) => {
        const roleHex =
          params.value === 'super_admin'
            ? chipHex.purple
            : params.value === 'admin'
            ? chipHex.navy
            : chipHex.slate;
        return (
          <Chip
            label={params.value?.replace('_', ' ')}
            size="small"
            sx={{ ...softChip(roleHex), textTransform: 'capitalize' }}
          />
        );
      },
    },
    {
      field: 'crm_types',
      headerName: 'CRM Access',
      width: 150,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {(params.value as string[] || []).map((crm: string) => (
            <Chip key={crm} label={crm} size="small" sx={softChip(chipHex.slate)} />
          ))}
        </Box>
      ),
    },
    {
      field: 'is_active',
      headerName: 'Status',
      width: 100,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          label={params.value ? 'Active' : 'Inactive'}
          size="small"
          sx={softChip(params.value ? chipHex.green : '#c0392b')}
        />
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 80,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => (
        <Tooltip title="Edit User">
          <IconButton
            size="small"
            color="primary"
            onClick={(e) => {
              e.stopPropagation();
              handleEditUserClick(params.row as User);
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: colors.textPrimary }}>
            Configurations
          </Typography>
          <Typography variant="body2" sx={{ color: colors.textSecondary, mt: 0.5 }}>
            Manage users and custom fields
          </Typography>
        </Box>
      </Box>

      <Paper
        elevation={0}
        sx={{
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: cardShadow,
          overflow: 'hidden',
        }}
      >
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            aria-label="configuration tabs"
            TabIndicatorProps={{ sx: { backgroundColor: colors.primary, height: 3, borderRadius: '3px 3px 0 0' } }}
            sx={{
              minHeight: 48,
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 500,
                fontSize: '0.875rem',
                minHeight: 48,
                color: colors.textSecondary,
              },
              '& .Mui-selected': {
                fontWeight: 700,
                color: `${colors.primary} !important`,
              },
            }}
          >
            <Tab
              icon={<GroupIcon />}
              iconPosition="start"
              label="Users"
              id="config-tab-0"
              aria-controls="config-tabpanel-0"
            />
            <Tab
              icon={<TuneIcon />}
              iconPosition="start"
              label="Custom Fields"
              id="config-tab-1"
              aria-controls="config-tabpanel-1"
            />
            <Tab
              icon={<ListIcon />}
              iconPosition="start"
              label="Dropdown Options"
              id="config-tab-2"
              aria-controls="config-tabpanel-2"
            />
          </Tabs>
        </Box>

        {/* Users Tab */}
        <TabPanel value={tabValue} index={0}>
          <Box sx={{ px: 3, pb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                User Management
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Tooltip title="Refresh">
                  <IconButton onClick={fetchUsers} color="primary">
                    <RefreshIcon />
                  </IconButton>
                </Tooltip>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setCreateUserModalOpen(true)}
                  sx={{
                    bgcolor: colors.primary,
                    borderRadius: 2,
                    textTransform: 'none',
                    fontWeight: 600,
                    '&:hover': { bgcolor: brandColors.navyBlueDark },
                  }}
                >
                  Add User
                </Button>
              </Box>
            </Box>

            <Paper
              elevation={0}
              sx={{
                height: 'calc(100vh - 380px)',
                minHeight: 400,
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                boxShadow: cardShadow,
                overflow: 'hidden',
              }}
            >
              <DataGrid
                rows={users}
                columns={userColumns}
                loading={usersLoading}
                pageSizeOptions={[10, 25, 50]}
                initialState={{
                  pagination: { paginationModel: { pageSize: 25 } },
                }}
                getRowId={(row) => row.id}
                disableRowSelectionOnClick
                disableColumnMenu
                columnHeaderHeight={48}
                getRowClassName={(params) =>
                  params.indexRelativeToCurrentPage % 2 === 0 ? 'row-even' : 'row-odd'
                }
                sx={{
                  border: 'none',
                  '& .MuiDataGrid-columnHeaders': {
                    backgroundColor: `${brandColors.navyBlue} !important`,
                  },
                  '& .MuiDataGrid-columnHeader': {
                    backgroundColor: `${brandColors.navyBlue} !important`,
                    color: '#fff',
                  },
                  '& .MuiDataGrid-columnHeaderTitle': {
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  },
                  '& .MuiDataGrid-columnSeparator': { color: 'rgba(255,255,255,0.25)' },
                  '& .MuiDataGrid-iconButtonContainer .MuiSvgIcon-root, & .MuiDataGrid-sortIcon': {
                    color: '#fff',
                  },
                  '& .MuiDataGrid-cell': { borderColor: '#eef1f5' },
                  '& .MuiDataGrid-cell:focus': { outline: 'none' },
                  '& .MuiDataGrid-row.row-even': { backgroundColor: '#f7f9fc' },
                  '& .MuiDataGrid-row:hover': { backgroundColor: '#eaf0fa' },
                  '& .MuiDataGrid-footerContainer': { borderColor: '#eef1f5' },
                }}
              />
            </Paper>
          </Box>
        </TabPanel>

        {/* Custom Fields Tab */}
        <TabPanel value={tabValue} index={1}>
          <Box sx={{ px: 3, pb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Custom Fields
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Add and manage custom fields for leads
                </Typography>
              </Box>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => handleOpenFieldDialog()}
                sx={{
                  bgcolor: colors.primary,
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  '&:hover': { bgcolor: brandColors.navyBlueDark },
                }}
              >
                Add Custom Field
              </Button>
            </Box>

            {fieldsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress sx={{ color: colors.primary }} />
              </Box>
            ) : fields.length === 0 ? (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  py: 8,
                  color: 'text.secondary',
                }}
              >
                <SettingsIcon sx={{ fontSize: 64, mb: 2, opacity: 0.3 }} />
                <Typography variant="body1" fontWeight={500}>No custom fields configured</Typography>
                <Typography variant="body2">
                  Click "Add Custom Field" to create your first custom field
                </Typography>
              </Box>
            ) : (
              <TableContainer
                component={Paper}
                elevation={0}
                sx={{
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: 'divider',
                  boxShadow: cardShadow,
                  overflow: 'hidden',
                }}
              >
                <Table>
                  <TableHead>
                    <TableRow
                      sx={{
                        bgcolor: colors.primaryLight,
                        '& .MuiTableCell-head': {
                          fontWeight: 700,
                          fontSize: '0.72rem',
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          color: colors.primary,
                          borderColor: '#eef1f5',
                        },
                      }}
                    >
                      <TableCell>Label</TableCell>
                      <TableCell>Field Name</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Required</TableCell>
                      <TableCell>Visible to Agents</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody
                    sx={{
                      '& .MuiTableCell-body': { borderColor: '#eef1f5' },
                      '& .MuiTableRow-root:hover': { backgroundColor: '#eaf0fa' },
                      '& .MuiTableRow-root:last-of-type .MuiTableCell-body': { borderBottom: 'none' },
                    }}
                  >
                    {fields.map((field) => (
                      <TableRow key={field.id} hover>
                        <TableCell>
                          <Typography fontWeight={500}>{field.field_label}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', color: colors.textSecondary }}>
                            {field.field_name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={getFieldTypeLabel(field.field_type)}
                            size="small"
                            sx={softChip(chipHex.navy)}
                          />
                        </TableCell>
                        <TableCell>
                          {field.is_required ? (
                            <Chip label="Yes" size="small" sx={softChip(chipHex.amber)} />
                          ) : (
                            <Chip label="No" size="small" sx={softChip(chipHex.slate)} />
                          )}
                        </TableCell>
                        <TableCell>
                          {field.visible_to_agents ? (
                            <Chip label="Yes" size="small" sx={softChip(chipHex.green)} />
                          ) : (
                            <Chip label="No" size="small" sx={softChip(chipHex.slate)} />
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={field.is_active ? 'Active' : 'Inactive'}
                            size="small"
                            sx={{ ...softChip(field.is_active ? chipHex.green : '#c0392b'), cursor: 'pointer' }}
                            onClick={() => handleToggleFieldActive(field)}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Edit">
                            <IconButton
                              size="small"
                              onClick={() => handleOpenFieldDialog(field)}
                              sx={{ color: colors.primary }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              onClick={() => {
                                setSelectedField(field);
                                setDeleteDialogOpen(true);
                              }}
                              sx={{ color: colors.error }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        </TabPanel>

        {/* Dropdown Options Tab */}
        <TabPanel value={tabValue} index={2}>
          <DropdownOptionsTab />
        </TabPanel>
      </Paper>

      {/* User Modals */}
      <UserCreateModal
        open={createUserModalOpen}
        onClose={() => setCreateUserModalOpen(false)}
        onSuccess={handleCreateUserSuccess}
      />

      <UserEditModal
        open={editUserModalOpen}
        user={selectedUser}
        onClose={() => {
          setEditUserModalOpen(false);
          setSelectedUser(null);
        }}
        onSuccess={handleEditUserSuccess}
      />

      {/* Add/Edit Field Dialog */}
      <Dialog
        open={fieldDialogOpen}
        onClose={handleCloseFieldDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" fontWeight={600}>
            {selectedField ? 'Edit Custom Field' : 'Add Custom Field'}
          </Typography>
          <IconButton onClick={handleCloseFieldDialog} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {formError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}

          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2.5,
              pt: 1,
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                '&.Mui-focused': { boxShadow: '0 0 0 3px rgba(30,64,136,0.12)' },
              },
            }}
          >
            <TextField
              label="Field Label"
              value={formData.field_label}
              onChange={(e) => setFormData({ ...formData, field_label: e.target.value })}
              fullWidth
              required
              placeholder="e.g., Insurance Provider"
              helperText="Display name shown to users"
            />

            {!selectedField && (
              <TextField
                label="Field Name"
                value={formData.field_name}
                onChange={(e) => setFormData({ ...formData, field_name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                fullWidth
                required
                placeholder="e.g., insurance_provider"
                helperText="Unique identifier (lowercase, underscores only)"
              />
            )}

            {!selectedField && (
              <FormControl fullWidth>
                <InputLabel>Field Type</InputLabel>
                <Select
                  value={formData.field_type}
                  label="Field Type"
                  onChange={(e) => setFormData({ ...formData, field_type: e.target.value as FieldType })}
                >
                  {FIELD_TYPES.map((type) => (
                    <MenuItem key={type.value} value={type.value}>
                      {type.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {formData.field_type === 'dropdown' && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Dropdown Options
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                  <TextField
                    size="small"
                    placeholder="Add option..."
                    value={dropdownInput}
                    onChange={(e) => setDropdownInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddDropdownOption();
                      }
                    }}
                    fullWidth
                  />
                  <Button
                    variant="outlined"
                    onClick={handleAddDropdownOption}
                    sx={{ minWidth: 80, borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
                  >
                    Add
                  </Button>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {formData.dropdown_options.map((option) => (
                    <Chip
                      key={option}
                      label={option}
                      onDelete={() => handleRemoveDropdownOption(option)}
                      size="small"
                    />
                  ))}
                </Box>
              </Box>
            )}

            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.is_required}
                    onChange={(e) => setFormData({ ...formData, is_required: e.target.checked })}
                  />
                }
                label="Required Field"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.visible_to_agents}
                    onChange={(e) => setFormData({ ...formData, visible_to_agents: e.target.checked })}
                  />
                }
                label="Visible to Agents"
              />
            </Box>

            <TextField
              label="Display Order"
              type="number"
              value={formData.display_order}
              onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
              helperText="Lower numbers appear first"
              InputProps={{ inputProps: { min: 0 } }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleCloseFieldDialog} sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveField}
            disabled={saving}
            sx={{
              bgcolor: colors.primary,
              borderRadius: 2,
              px: 3,
              textTransform: 'none',
              fontWeight: 600,
              '&:hover': { bgcolor: brandColors.navyBlueDark },
            }}
          >
            {saving ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : selectedField ? 'Save Changes' : 'Create Field'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 600 }}>Delete Custom Field</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the field "<strong>{selectedField?.field_label}</strong>"?
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleDeleteField}
            sx={{
              bgcolor: colors.error,
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              '&:hover': { bgcolor: '#dc2626' },
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
