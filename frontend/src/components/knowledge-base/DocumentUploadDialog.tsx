import { useState, useRef } from 'react';
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
  Typography,
  LinearProgress,
  Alert,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DescriptionIcon from '@mui/icons-material/Description';
import { knowledgeBaseService } from '../../services/knowledgeBaseService';
import { DocumentCategory, DOCUMENT_CATEGORIES } from '../../types/knowledge-base.types';
import { brandColors } from '../../theme';

const navyFocusRing = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 2,
    '&.Mui-focused': { boxShadow: `0 0 0 3px ${brandColors.navyBlue}1F` },
  },
};

interface DocumentUploadDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DocumentUploadDialog({
  open,
  onClose,
  onSuccess,
}: DocumentUploadDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('General');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleClose = () => {
    if (!uploading) {
      setFile(null);
      setName('');
      setCategory('General');
      setDescription('');
      setError(null);
      onClose();
    }
  };

  const handleFileSelect = (selectedFile: File) => {
    const validTypes = ['.pdf', '.docx', '.doc', '.csv'];
    const extension = '.' + selectedFile.name.split('.').pop()?.toLowerCase();

    if (!validTypes.includes(extension)) {
      setError('Invalid file type. Allowed: PDF, DOCX, DOC, CSV');
      return;
    }

    const maxSize = 50 * 1024 * 1024; // 50MB
    if (selectedFile.size > maxSize) {
      setError('File too large. Maximum size: 50MB');
      return;
    }

    setFile(selectedFile);
    setError(null);

    // Auto-fill name from filename if empty
    if (!name) {
      const baseName = selectedFile.name.replace(/\.[^/.]+$/, '');
      setName(baseName);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file || !name.trim()) return;

    setUploading(true);
    setError(null);

    try {
      await knowledgeBaseService.uploadDocument(
        file,
        name.trim(),
        category,
        description.trim() || undefined
      );
      onSuccess();
      handleClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload document';
      setError(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
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
      <DialogTitle sx={{ fontWeight: 700 }}>Upload Document</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Drop Zone */}
        <Box
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          sx={{
            border: '2px dashed',
            borderColor: dragActive ? brandColors.navyBlue : '#cbd5e1',
            borderRadius: 3,
            p: 4,
            textAlign: 'center',
            cursor: 'pointer',
            bgcolor: dragActive ? `${brandColors.navyBlue}0A` : 'background.paper',
            transition: 'all 0.2s',
            mb: 3,
            '&:hover': {
              borderColor: brandColors.navyBlue,
              bgcolor: `${brandColors.navyBlue}0A`,
            },
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.csv"
            hidden
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          />

          {file ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: `linear-gradient(135deg, ${brandColors.navyBlue}, ${brandColors.navyBlueDark})`,
                  color: '#fff',
                  flexShrink: 0,
                }}
              >
                <DescriptionIcon sx={{ fontSize: 26 }} />
              </Box>
              <Box sx={{ textAlign: 'left' }}>
                <Typography variant="body1" fontWeight={600}>
                  {file.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatFileSize(file.size)}
                </Typography>
              </Box>
            </Box>
          ) : (
            <>
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 1.5,
                  background: `linear-gradient(135deg, ${brandColors.navyBlue}, ${brandColors.navyBlueDark})`,
                  color: '#fff',
                }}
              >
                <CloudUploadIcon sx={{ fontSize: 30 }} />
              </Box>
              <Typography variant="body1" color="text.secondary">
                Drag and drop a file here, or click to select
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Supported: PDF, DOCX, DOC, CSV (max 50MB)
              </Typography>
            </>
          )}
        </Box>

        {/* Document Details */}
        <TextField
          label="Document Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
          required
          sx={{ mb: 2, ...navyFocusRing }}
          disabled={uploading}
        />

        <FormControl fullWidth sx={{ mb: 2, ...navyFocusRing }}>
          <InputLabel>Category</InputLabel>
          <Select
            value={category}
            label="Category"
            onChange={(e) => setCategory(e.target.value as DocumentCategory)}
            disabled={uploading}
          >
            {DOCUMENT_CATEGORIES.map((cat) => (
              <MenuItem key={cat} value={cat}>
                {cat}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          label="Description (Optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          fullWidth
          multiline
          rows={3}
          sx={navyFocusRing}
          disabled={uploading}
        />

        {uploading && (
          <Box sx={{ mt: 2 }}>
            <LinearProgress />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
              Uploading and processing document...
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          onClick={handleClose}
          disabled={uploading}
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleUpload}
          disabled={!file || !name.trim() || uploading}
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
        >
          Upload
        </Button>
      </DialogActions>
    </Dialog>
  );
}
