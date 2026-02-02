import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  alpha,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import SettingsIcon from '@mui/icons-material/Settings';
import { toast } from 'react-toastify';
import { dropdownService } from '../../services/dropdownService';
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
    toast.success(`Added "${value}" to ${selectedConfig.display_name}`);
    fetchConfigs();
  };

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
                sx={{
                  mb: 1,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px !important',
                  '&:before': { display: 'none' },
                  '&.Mui-expanded': { margin: '0 0 8px 0' },
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{
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
                            >
                              Add
                            </Button>
                          </Box>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {options.map((option) => (
                              <Chip
                                key={option}
                                label={option}
                                size="small"
                                sx={{ bgcolor: colors.background }}
                              />
                            ))}
                            {options.length === 0 && (
                              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                No options configured
                              </Typography>
                            )}
                          </Box>
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
                        >
                          Add Value
                        </Button>
                      </Box>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {config.options.map((option) => (
                          <Chip
                            key={option}
                            label={option}
                            size="small"
                            sx={{ bgcolor: colors.background }}
                          />
                        ))}
                      </Box>
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
    </Box>
  );
}
