import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  alpha,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import SettingsIcon from '@mui/icons-material/Settings';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { toast } from 'react-toastify';
import { dropdownService } from '../../services/dropdownService';
import { clearDropdownCache } from '../../hooks/useDropdownOptions';
import { DropdownConfig } from '../../types/dropdown.types';
import AddDropdownValueDialog from './AddDropdownValueDialog';
import { brandColors } from '../../theme';

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

interface CategoryConfig {
  label: string;
  description: string;
}

const CATEGORY_LABELS: Record<string, CategoryConfig> = {
  leads: { label: 'Lead Dropdowns', description: 'Dropdown options specific to lead management' },
  enrollments: { label: 'Enrollment Dropdowns', description: 'Dropdown options specific to enrollment management' },
  common: { label: 'Shared Dropdowns', description: 'Dropdown options used across both leads and enrollments' },
};

export default function DropdownOptionsTab() {
  const [configs, setConfigs] = useState<DropdownConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add value dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<DropdownConfig | null>(null);
  const [selectedParentValue, setSelectedParentValue] = useState<string | undefined>();

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{ config: DropdownConfig; value: string; parentValue?: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await dropdownService.getDropdownConfigs();
      setConfigs(response.configs);
    } catch (err) {
      console.error('Failed to fetch dropdown configs:', err);
      setError('Failed to load dropdown configurations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const handleSeedConfigs = async () => {
    setSeeding(true);
    try {
      const result = await dropdownService.seedDropdownConfigs();
      toast.success(`${result.message} (${result.created} created, ${result.skipped} skipped)`);
      fetchConfigs();
    } catch (err) {
      console.error('Failed to seed configs:', err);
      toast.error('Failed to seed dropdown configurations');
    } finally {
      setSeeding(false);
    }
  };

  const handleOpenAddDialog = (config: DropdownConfig) => {
    setSelectedConfig(config);
    setAddDialogOpen(true);
  };

  const handleCloseAddDialog = () => {
    setAddDialogOpen(false);
    setSelectedConfig(null);
  };

  const handleAddValue = async (value: string, parentValue?: string) => {
    if (!selectedConfig) return;

    await dropdownService.addOption(selectedConfig.field_name, {
      value,
      parent_value: parentValue || selectedParentValue,
    });
    // Invalidate the form dropdown cache so the new option shows up immediately
    clearDropdownCache();
    toast.success(`Added "${value}" to ${selectedConfig.display_name}`);
    fetchConfigs();
  };

  const handleConfirmRemoveValue = async () => {
    if (!deleteTarget) return;
    const { config, value, parentValue } = deleteTarget;
    setDeleting(true);
    try {
      await dropdownService.removeOption(config.field_name, { value, parent_value: parentValue });
      clearDropdownCache();
      toast.success(`Removed "${value}"`);
      setDeleteTarget(null);
      fetchConfigs();
    } catch (err) {
      console.error('Failed to remove option:', err);
      toast.error(`Failed to remove "${value}"`);
    } finally {
      setDeleting(false);
    }
  };

  // Reorder a value within its option list by swapping with its neighbour
  const handleMoveValue = async (
    config: DropdownConfig,
    index: number,
    direction: -1 | 1,
    parentValue?: string
  ) => {
    const list = parentValue
      ? [...(config.conditional_options?.[parentValue] || [])]
      : [...config.options];
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    try {
      if (parentValue) {
        const updated = { ...(config.conditional_options || {}), [parentValue]: list };
        await dropdownService.updateDropdownConfig(config.field_name, { conditional_options: updated });
      } else {
        await dropdownService.updateDropdownConfig(config.field_name, { options: list });
      }
      clearDropdownCache();
      fetchConfigs();
    } catch (err) {
      console.error('Failed to reorder options:', err);
      toast.error('Failed to reorder values');
    }
  };

  // Renders a reorderable, deletable list of option values
  const renderOptionList = (config: DropdownConfig, list: string[], parentValue?: string) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {list.map((option, idx) => (
        <Box
          key={option}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            pl: 1,
            pr: 0.5,
            py: 0.5,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: '#fff',
            transition: 'border-color 0.15s ease, background-color 0.15s ease',
            '&:hover': { borderColor: alpha(colors.primary, 0.4), bgcolor: alpha(colors.primary, 0.02) },
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Tooltip title="Move up">
              <span>
                <IconButton
                  size="small"
                  disabled={idx === 0}
                  onClick={() => handleMoveValue(config, idx, -1, parentValue)}
                  sx={{ p: 0, height: 16 }}
                >
                  <KeyboardArrowUpIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Move down">
              <span>
                <IconButton
                  size="small"
                  disabled={idx === list.length - 1}
                  onClick={() => handleMoveValue(config, idx, 1, parentValue)}
                  sx={{ p: 0, height: 16 }}
                >
                  <KeyboardArrowDownIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
          <Typography variant="body2" sx={{ flex: 1, color: colors.textPrimary }}>
            {option}
          </Typography>
          <Tooltip title="Delete">
            <IconButton
              size="small"
              onClick={() => setDeleteTarget({ config, value: option, parentValue })}
              sx={{ color: 'error.main', '&:hover': { bgcolor: alpha('#ef4444', 0.08) } }}
            >
              <DeleteOutlineIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
      ))}
      {list.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          No options configured
        </Typography>
      )}
    </Box>
  );

  // Group configs by category
  const configsByCategory = configs.reduce((acc, config) => {
    const category = config.category || 'common';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(config);
    return acc;
  }, {} as Record<string, DropdownConfig[]>);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress sx={{ color: colors.primary }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mx: 3 }}>
        {error}
      </Alert>
    );
  }

  if (configs.length === 0) {
    return (
      <Box sx={{ px: 3, pb: 3 }}>
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
          <Typography variant="body1" fontWeight={500}>
            No dropdown configurations found
          </Typography>
          <Typography variant="body2" sx={{ mb: 3 }}>
            Click the button below to initialize dropdown options from defaults
          </Typography>
          <Button
            variant="contained"
            onClick={handleSeedConfigs}
            disabled={seeding}
            sx={{
              bgcolor: colors.primary,
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              '&:hover': { bgcolor: brandColors.navyBlueDark },
            }}
          >
            {seeding ? <CircularProgress size={20} sx={{ color: '#fff', mr: 1 }} /> : null}
            Initialize Dropdown Options
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ px: 3, pb: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Dropdown Options
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage dropdown values for leads and enrollments
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Refresh">
            <IconButton onClick={fetchConfigs} color="primary">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {['common', 'leads', 'enrollments'].map((category) => {
        const categoryConfigs = configsByCategory[category];
        if (!categoryConfigs || categoryConfigs.length === 0) return null;

        const categoryInfo = CATEGORY_LABELS[category] || {
          label: category,
          description: '',
        };

        return (
          <Box key={category} sx={{ mb: 3 }}>
            <Typography
              variant="subtitle1"
              sx={{ fontWeight: 600, color: colors.textPrimary, mb: 1 }}
            >
              {categoryInfo.label}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {categoryInfo.description}
            </Typography>

            {categoryConfigs.map((config) => (
              <Accordion
                key={config.field_name}
                elevation={0}
                sx={{
                  mb: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: '12px !important',
                  boxShadow: '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)',
                  overflow: 'hidden',
                  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                  '&:before': { display: 'none' },
                  '&:hover': {
                    borderColor: alpha(colors.primary, 0.4),
                    boxShadow: '0 2px 6px rgba(16,24,40,0.08), 0 1px 3px rgba(16,24,40,0.06)',
                  },
                  '&.Mui-expanded': { margin: '0 0 8px 0' },
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{
                    borderRadius: '12px',
                    '&:hover': { bgcolor: alpha(colors.primary, 0.03) },
                    '&.Mui-expanded': { bgcolor: alpha(colors.primary, 0.04) },
                    '& .MuiAccordionSummary-content': {
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      pr: 2,
                    },
                  }}
                >
                  <Box>
                    <Typography fontWeight={500}>{config.display_name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {config.is_conditional
                        ? `Conditional on ${config.parent_field}`
                        : `${config.options.length} options`}
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {config.is_conditional && config.conditional_options ? (
                    // Render conditional dropdown with grouped options
                    <Box>
                      {Object.entries(config.conditional_options).map(([parentValue, options]) => (
                        <Box key={parentValue} sx={{ mb: 2 }}>
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              mb: 1,
                            }}
                          >
                            <Typography
                              variant="subtitle2"
                              sx={{ fontWeight: 600, color: colors.primary }}
                            >
                              {parentValue}
                            </Typography>
                            <Button
                              size="small"
                              startIcon={<AddIcon />}
                              onClick={() => {
                                setSelectedConfig(config);
                                setSelectedParentValue(parentValue);
                                setAddDialogOpen(true);
                              }}
                              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
                            >
                              Add
                            </Button>
                          </Box>
                          {renderOptionList(config, options, parentValue)}
                        </Box>
                      ))}
                    </Box>
                  ) : (
                    // Render regular dropdown options
                    <Box>
                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          mb: 1,
                        }}
                      >
                        <Button
                          size="small"
                          startIcon={<AddIcon />}
                          onClick={() => handleOpenAddDialog(config)}
                          sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
                        >
                          Add Value
                        </Button>
                      </Box>
                      {renderOptionList(config, config.options)}
                    </Box>
                  )}
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        );
      })}

      {/* Add Value Dialog */}
      {selectedConfig && (
        <AddDropdownValueDialog
          open={addDialogOpen}
          onClose={handleCloseAddDialog}
          onSave={handleAddValue}
          fieldName={selectedConfig.field_name}
          displayName={selectedConfig.display_name}
          isConditional={selectedConfig.is_conditional}
          parentOptions={
            selectedConfig.is_conditional && selectedConfig.conditional_options
              ? Object.keys(selectedConfig.conditional_options)
              : undefined
          }
          existingValues={selectedConfig.options}
          defaultParentValue={selectedParentValue}
        />
      )}

      {/* Delete Value Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Delete value</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete{' '}
            <strong>"{deleteTarget?.value}"</strong>
            {deleteTarget ? ` from ${deleteTarget.config.display_name}` : ''}? This option will no
            longer be available in the dropdown. Existing records keep their value.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setDeleteTarget(null)}
            disabled={deleting}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmRemoveValue}
            color="error"
            variant="contained"
            disabled={deleting}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
          >
            {deleting ? 'Deleting...' : 'Yes, Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
