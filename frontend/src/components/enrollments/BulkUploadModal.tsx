import { useState, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  Divider,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  Paper,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DownloadIcon from '@mui/icons-material/Download';
import { toast } from 'react-toastify';
import { enrollmentService } from '../../services/enrollmentService';
import { BulkUploadResponse } from '../../types/enrollment.types';

interface BulkUploadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BulkUploadModal({ open, onClose, onSuccess }: BulkUploadModalProps) {
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<BulkUploadResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    setSelectedFile(null);
    setResult(null);
    onClose();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.csv') && !file.name.endsWith('.xlsx')) {
        toast.error('Please select a CSV or Excel file');
        return;
      }
      setSelectedFile(file);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      const response = await enrollmentService.bulkUpload(selectedFile);
      setResult(response);
      if (response.success) {
        toast.success(`Successfully created ${response.created} enrollments`);
        onSuccess();
      }
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to upload file';
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    // Create a CSV template
    const headers = [
      'Billed Date',
      'Package Billed',
      'HCLH SPOC',
      'HCL Location',
      'UHID',
      'Subscriber Name',
      'DOB',
      'EmployeeID',
      'Name',
      'Phone Number',
      'Email',
      'Address',
      'Current Trimester',
      'Doctor Name',
      'Service (Partner)',
      'Partner Centre Selected',
      'Partner Gynaecologist',
      'Connect Status',
      'Action Taken',
      'Follow Up Date',
      'Customer Feedback',
      'Remarks',
    ];

    const csvContent = headers.join(',') + '\n';
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'enrollment_upload_template.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Bulk Upload Enrollments
          </Typography>
          <IconButton onClick={handleClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <Divider />

      <DialogContent>
        <Box sx={{ textAlign: 'center', py: 2 }}>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleDownloadTemplate}
            sx={{ mb: 3 }}
          >
            Download Template
          </Button>

          <Paper
            variant="outlined"
            sx={{
              p: 4,
              border: '2px dashed',
              borderColor: selectedFile ? 'primary.main' : 'grey.300',
              bgcolor: selectedFile ? 'primary.50' : 'grey.50',
              cursor: 'pointer',
              '&:hover': {
                borderColor: 'primary.main',
                bgcolor: 'primary.50',
              },
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".csv,.xlsx"
              style={{ display: 'none' }}
            />
            <CloudUploadIcon sx={{ fontSize: 48, color: 'grey.400', mb: 2 }} />
            <Typography variant="body1" sx={{ mb: 1 }}>
              {selectedFile ? selectedFile.name : 'Click to select a file'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Supported formats: CSV, XLSX
            </Typography>
          </Paper>

          {result && (
            <Box sx={{ mt: 3, textAlign: 'left' }}>
              {result.success ? (
                <Alert severity="success" sx={{ mb: 2 }}>
                  Successfully processed {result.total_rows} rows. Created {result.created} enrollments.
                </Alert>
              ) : (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Upload completed with errors. Created {result.created} of {result.total_rows} enrollments.
                </Alert>
              )}

              {result.errors && result.errors.length > 0 && (
                <Paper variant="outlined" sx={{ maxHeight: 200, overflow: 'auto' }}>
                  <List dense>
                    {result.errors.map((error, index) => (
                      <ListItem key={index}>
                        <ListItemText
                          primary={`Row ${error.row}`}
                          secondary={error.error}
                          secondaryTypographyProps={{ color: 'error' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Paper>
              )}
            </Box>
          )}

          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Required columns: Subscriber Name, EmployeeID, Phone Number
          </Typography>
        </Box>
      </DialogContent>

      <Divider />

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose}>Close</Button>
        <Button
          variant="contained"
          onClick={handleUpload}
          disabled={!selectedFile || uploading}
          startIcon={uploading ? <CircularProgress size={20} /> : <CloudUploadIcon />}
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
