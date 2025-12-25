import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
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
  Tooltip,
  Alert,
  alpha,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SettingsIcon from '@mui/icons-material/Settings';
import CloseIcon from '@mui/icons-material/Close';
import { toast } from 'react-toastify';
import { customFieldService } from '../services/customFieldService';
import {
  CustomField,
  CustomFieldCreate,
  FieldType,
  FIELD_TYPES,
} from '../types/custom-field.types';
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

export default function SettingsPage() {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<CustomField | null>(null);
  const [formData, setFormData] = useState<FieldFormData>(initialFormData);
  const [dropdownInput, setDropdownInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchFields = useCallback(async () => {
    setLoading(true);
    try {
      const response = await customFieldService.getFields(false);
      setFields(response.fields);
    } catch (error) {
      console.error('Failed to fetch custom fields:', error);
      toast.error('Failed to load custom fields');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFields();
  }, [fetchFields]);

  const handleOpenDialog = (field?: CustomField) => {
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
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
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
      // Validate field_name format
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

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    setFormError('');

    try {
      if (selectedField) {
        // Update
        await customFieldService.updateField(selectedField.id, {
          field_label: formData.field_label,
          is_required: formData.is_required,
          dropdown_options: formData.dropdown_options,
          visible_to_agents: formData.visible_to_agents,
          display_order: formData.display_order,
        });
        toast.success('Custom field updated successfully');
      } else {
        // Create
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
      handleCloseDialog();
      fetchFields();
    } catch (error: any) {
      console.error('Failed to save custom field:', error);
      const message = error.response?.data?.detail || 'Failed to save custom field';
      setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
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

  const handleToggleActive = async (field: CustomField) => {
    try {
      await customFieldService.updateField(field.id, {
        is_active: !field.is_active,
      });
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

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600, color: colors.textPrimary }}>
            Settings
          </Typography>
          <Typography variant="body2" sx={{ color: colors.textSecondary, mt: 0.5 }}>
            Configure custom fields for lead management
          </Typography>
        </Box>
      </Box>

      <Paper sx={{ p: 3, borderRadius: 2, border: `1px solid ${colors.border}` }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, color: colors.textPrimary }}>
              Custom Fields
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Add and manage custom fields for leads
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
            sx={{
              bgcolor: colors.primary,
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              px: 3,
              '&:hover': { bgcolor: brandColors.navyBlueDark },
            }}
          >
            Add Custom Field
          </Button>
        </Box>

        {loading ? (
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
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Label</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Field Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Required</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Visible to Agents</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
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
                        sx={{ bgcolor: colors.primaryLight, color: colors.primary }}
                      />
                    </TableCell>
                    <TableCell>
                      {field.is_required ? (
                        <Chip label="Yes" size="small" sx={{ bgcolor: colors.warningLight, color: colors.warning }} />
                      ) : (
                        <Chip label="No" size="small" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell>
                      {field.visible_to_agents ? (
                        <Chip label="Yes" size="small" sx={{ bgcolor: colors.successLight, color: colors.success }} />
                      ) : (
                        <Chip label="No" size="small" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={field.is_active ? 'Active' : 'Inactive'}
                        size="small"
                        sx={{
                          bgcolor: field.is_active ? colors.successLight : colors.errorLight,
                          color: field.is_active ? colors.success : colors.error,
                          cursor: 'pointer',
                        }}
                        onClick={() => handleToggleActive(field)}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Edit">
                        <IconButton
                          size="small"
                          onClick={() => handleOpenDialog(field)}
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
      </Paper>

      {/* Add/Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" fontWeight={600}>
            {selectedField ? 'Edit Custom Field' : 'Add Custom Field'}
          </Typography>
          <IconButton onClick={handleCloseDialog} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {formError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
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
                    sx={{ minWidth: 80 }}
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
          <Button onClick={handleCloseDialog} sx={{ borderRadius: 2 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            sx={{
              bgcolor: colors.primary,
              borderRadius: 2,
              px: 3,
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
          <Button onClick={() => setDeleteDialogOpen(false)} sx={{ borderRadius: 2 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleDelete}
            sx={{
              bgcolor: colors.error,
              borderRadius: 2,
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
