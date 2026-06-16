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
  Box,
  Chip,
  OutlinedInput,
  Alert,
} from '@mui/material';
import { knowledgeBaseService } from '../../services/knowledgeBaseService';
import {
  KnowledgeDocument,
  DocumentCategory,
  DOCUMENT_CATEGORIES,
} from '../../types/knowledge-base.types';
import { brandColors } from '../../theme';

const navyFocusRing = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 2,
    '&.Mui-focused': { boxShadow: `0 0 0 3px ${brandColors.navyBlue}1F` },
  },
};

interface DocumentEditDialogProps {
  open: boolean;
  document: KnowledgeDocument | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DocumentEditDialog({
  open,
  document,
  onClose,
  onSuccess,
}: DocumentEditDialogProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('General');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (document) {
      setName(document.name);
      setCategory(document.category);
      setDescription(document.description || '');
      setTags(document.tags || []);
    }
  }, [document]);

  const handleClose = () => {
    if (!saving) {
      setError(null);
      setTagInput('');
      onClose();
    }
  };

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleSave = async () => {
    if (!document || !name.trim()) return;

    setSaving(true);
    setError(null);

    try {
      await knowledgeBaseService.updateDocument(document.id, {
        name: name.trim(),
        category,
        description: description.trim() || undefined,
        tags,
      });
      onSuccess();
      handleClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update document';
      setError(errorMessage);
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
      PaperProps={{
        sx: {
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)',
        },
      }}
    >
      <DialogTitle sx={{ fontWeight: 700 }}>Edit Document</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <TextField
          label="Document Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
          required
          sx={{ mb: 2, mt: 1, ...navyFocusRing }}
          disabled={saving}
        />

        <FormControl fullWidth sx={{ mb: 2, ...navyFocusRing }}>
          <InputLabel>Category</InputLabel>
          <Select
            value={category}
            label="Category"
            onChange={(e) => setCategory(e.target.value as DocumentCategory)}
            disabled={saving}
          >
            {DOCUMENT_CATEGORIES.map((cat) => (
              <MenuItem key={cat} value={cat}>
                {cat}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          fullWidth
          multiline
          rows={3}
          sx={{ mb: 2, ...navyFocusRing }}
          disabled={saving}
        />

        {/* Tags */}
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel shrink>Tags</InputLabel>
          <Box
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              p: 1,
              minHeight: 56,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 0.5,
              mt: 2,
            }}
          >
            {tags.map((tag) => (
              <Chip
                key={tag}
                label={tag}
                size="small"
                onDelete={() => handleRemoveTag(tag)}
                disabled={saving}
                sx={{
                  bgcolor: `${brandColors.navyBlue}1A`,
                  color: brandColors.navyBlue,
                  fontWeight: 600,
                  fontSize: '0.7rem',
                  height: 24,
                  borderRadius: '8px',
                  border: `1px solid ${brandColors.navyBlue}33`,
                  '& .MuiChip-label': { px: 1 },
                  '& .MuiChip-deleteIcon': { color: `${brandColors.navyBlue}99` },
                }}
              />
            ))}
            <OutlinedInput
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              onBlur={handleAddTag}
              placeholder="Add tag..."
              size="small"
              sx={{
                flex: 1,
                minWidth: 100,
                '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
              }}
              disabled={saving}
            />
          </Box>
        </FormControl>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          onClick={handleClose}
          disabled={saving}
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!name.trim() || saving}
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
