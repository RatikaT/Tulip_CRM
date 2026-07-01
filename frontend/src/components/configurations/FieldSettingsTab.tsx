import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControl,
  Select,
  MenuItem,
  Switch,
  Autocomplete,
  TextField,
  CircularProgress,
  Alert,
  alpha,
} from '@mui/material';
import { toast } from 'react-toastify';
import { fieldConfigService } from '../../services/fieldConfigService';
import { FieldConfigItem, FieldInputType } from '../../types/fieldConfig.types';
import { brandColors } from '../../theme';

const colors = {
  primary: brandColors.navyBlue,
  primaryLight: alpha(brandColors.navyBlue, 0.08),
  textPrimary: '#1e293b',
  textSecondary: '#64748b',
};

const cardShadow = '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)';

type FormType = 'lead' | 'enrollment';

export default function FieldSettingsTab() {
  const [form, setForm] = useState<FormType>('lead');
  const [leadFields, setLeadFields] = useState<FieldConfigItem[]>([]);
  const [enrollmentFields, setEnrollmentFields] = useState<FieldConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fieldConfigService.all();
      setLeadFields(data.lead);
      setEnrollmentFields(data.enrollment);
    } catch (err) {
      console.error('Failed to fetch field configs:', err);
      setError('Failed to load field settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const fields = form === 'lead' ? leadFields : enrollmentFields;
  const setFields = form === 'lead' ? setLeadFields : setEnrollmentFields;

  const updateLocal = (fieldName: string, patch: Partial<FieldConfigItem>) => {
    setFields((prev) =>
      prev.map((f) => (f.field_name === fieldName ? { ...f, ...patch } : f))
    );
  };

  const handleSave = async (item: FieldConfigItem) => {
    setSavingField(item.field_name);
    try {
      const updated = await fieldConfigService.upsert({
        form,
        field_name: item.field_name,
        label: item.label,
        input_type: item.input_type,
        required: item.required,
        options: item.input_type === 'dropdown' ? item.options : [],
      });
      updateLocal(item.field_name, updated);
      toast.success(`Saved "${item.label}"`);
    } catch (err) {
      console.error('Failed to save field config:', err);
      toast.error(`Failed to save "${item.label}"`);
    } finally {
      setSavingField(null);
    }
  };

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

  return (
    <Box sx={{ px: 3, pb: 3 }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Field Settings
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Configure how these fields behave on the Lead / Enrollment forms. This is in addition to
          the built-in mandatory rules.
        </Typography>
      </Box>

      <ToggleButtonGroup
        value={form}
        exclusive
        onChange={(_e, val: FormType | null) => {
          if (val) setForm(val);
        }}
        size="small"
        sx={{
          mb: 2,
          '& .MuiToggleButton-root': {
            textTransform: 'none',
            fontWeight: 600,
            px: 2.5,
            borderRadius: 2,
            color: colors.textSecondary,
            '&.Mui-selected': {
              bgcolor: colors.primaryLight,
              color: colors.primary,
              '&:hover': { bgcolor: colors.primaryLight },
            },
          },
        }}
      >
        <ToggleButton value="lead">Lead</ToggleButton>
        <ToggleButton value="enrollment">Enrollment</ToggleButton>
      </ToggleButtonGroup>

      {fields.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', py: 4 }}>
          No configurable fields for this form.
        </Typography>
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
                <TableCell sx={{ minWidth: 200 }}>Field</TableCell>
                <TableCell align="center">Required</TableCell>
                <TableCell sx={{ minWidth: 140 }}>Input Type</TableCell>
                <TableCell sx={{ minWidth: 260 }}>Options</TableCell>
                <TableCell align="right">Save</TableCell>
              </TableRow>
            </TableHead>
            <TableBody
              sx={{
                '& .MuiTableCell-body': { borderColor: '#eef1f5', verticalAlign: 'top' },
                '& .MuiTableRow-root:last-of-type .MuiTableCell-body': { borderBottom: 'none' },
              }}
            >
              {fields.map((item) => {
                const isSaving = savingField === item.field_name;
                const isDropdown = item.input_type === 'dropdown';
                return (
                  <TableRow key={item.field_name} hover>
                    <TableCell>
                      <Typography fontWeight={500} sx={{ color: colors.textPrimary }}>
                        {item.label}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ fontFamily: 'monospace', color: colors.textSecondary }}
                      >
                        {item.field_name}
                      </Typography>
                      {item.updated_by_name && (
                        <Typography
                          variant="caption"
                          display="block"
                          sx={{ color: colors.textSecondary, mt: 0.5 }}
                        >
                          Last updated by {item.updated_by_name}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Switch
                        checked={item.required}
                        onChange={(e) =>
                          updateLocal(item.field_name, { required: e.target.checked })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <FormControl size="small" fullWidth>
                        <Select
                          value={item.input_type}
                          onChange={(e) =>
                            updateLocal(item.field_name, {
                              input_type: e.target.value as FieldInputType,
                            })
                          }
                          sx={{ borderRadius: 2 }}
                        >
                          <MenuItem value="text">Text</MenuItem>
                          <MenuItem value="dropdown">Dropdown</MenuItem>
                        </Select>
                      </FormControl>
                    </TableCell>
                    <TableCell>
                      {isDropdown ? (
                        <Autocomplete
                          multiple
                          freeSolo
                          size="small"
                          options={[]}
                          value={item.options}
                          onChange={(_e, val) =>
                            updateLocal(item.field_name, { options: val as string[] })
                          }
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              placeholder={item.options.length ? '' : 'Type an option, press Enter'}
                              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                            />
                          )}
                        />
                      ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                          —
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => handleSave(item)}
                        disabled={isSaving}
                        sx={{
                          bgcolor: colors.primary,
                          borderRadius: 2,
                          textTransform: 'none',
                          fontWeight: 600,
                          minWidth: 72,
                          '&:hover': { bgcolor: brandColors.navyBlueDark },
                        }}
                      >
                        {isSaving ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Save'}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
