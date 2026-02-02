import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  IconButton,
  CircularProgress,
  Alert,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

interface AddDropdownValueDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (value: string, parentValue?: string) => Promise<void>;
  fieldName: string;
  displayName: string;
  isConditional: boolean;
  parentOptions?: string[];
  existingValues?: string[];
  defaultParentValue?: string;
}

export default function AddDropdownValueDialog({
  open,
  onClose,
  onSave,
  fieldName,
  displayName,
  isConditional,
  parentOptions = [],
  existingValues = [],
  defaultParentValue,
}: AddDropdownValueDialogProps) {
  const [value, setValue] = useState('');
  const [parentValue, setParentValue] = useState(defaultParentValue || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Update parentValue when defaultParentValue changes (when dialog opens)
  useEffect(() => {
    if (defaultParentValue) {
      setParentValue(defaultParentValue);
    }
  }, [defaultParentValue]);

  const handleClose = () => {
    setValue('');
    setParentValue(defaultParentValue || '');
    setError('');
    onClose();
  };

  const handleSave = async () => {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      setError('Value is required');
      return;
    }

    if (isConditional && !parentValue) {
      setError('Please select a parent option');
      return;
    }

    // Check for duplicates
    if (!isConditional && existingValues.includes(trimmedValue)) {
      setError('This value already exists');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await onSave(trimmedValue, isConditional ? parentValue : undefined);
      handleClose();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to add value');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" fontWeight={600}>
          Add New Value to {displayName}
        </Typography>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {isConditional && parentOptions.length > 0 && (
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Parent Option</InputLabel>
            <Select
              value={parentValue}
              label="Parent Option"
              onChange={(e) => setParentValue(e.target.value)}
            >
              {parentOptions.map((opt) => (
                <MenuItem key={opt} value={opt}>
                  {opt}
                </MenuItem>
              ))}
            </Select>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
              Select which {fieldName === 'partner_center' ? 'Service Partner' : 'parent option'} this value belongs to
            </Typography>
          </FormControl>
        )}

        <TextField
          autoFocus
          label="New Value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          fullWidth
          placeholder="Enter the new dropdown value"
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !saving) {
              e.preventDefault();
              handleSave();
            }
          }}
        />
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} sx={{ borderRadius: 2 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || !value.trim()}
          sx={{ borderRadius: 2, px: 3 }}
        >
          {saving ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : 'Add Value'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
