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
      if (!file.name.endsWith('.csv')) {
        toast.error('Please select a CSV file');
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

      // Show appropriate toast based on results
      const { created = 0, errors = [] } = response;
      if (created > 0 && errors.length === 0) {
        toast.success(`Successfully created ${created} enrollments`);
        onSuccess();
      } else if (created > 0 && errors.length > 0) {
        toast.warning(`Created ${created} enrollments. ${errors.length} entries failed.`);
        onSuccess();
      } else if (created === 0 && errors.length > 0) {
        toast.error(`Upload failed. ${errors.length} entries had errors.`);
      } else if (created === 0 && errors.length === 0) {
        toast.warning('No enrollments were created.');
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
    // Create a CSV template with headers and sample data
    const headers = [
      'Billed Date',
      'Package Billed',
      'HCLH SPOC',
      'HCL Facility',
      'UHID',
      'Subscriber Name',
      'DOB',
      'EmployeeID',
      'Name',
      'Contact No.',
      'Email',
      'Address',
      'Current Trimester',
      'Service Enrolled',
      'Package Name Enrolled',
      'Doctor Name',
      'Service (Partner)',
      'Partner Centre Selected',
      'Partner Gynaecologist',
      'Connect Status',
      'Action Taken',
      'Follow Up Date',
      'Next Follow Up Date',
      'Customer Feedback',
      'Remarks',
    ];

    // Sample data rows with realistic examples
    const sampleRows = [
      [
        '2025-12-01',
        'Maternity Premium',
        'Dr. Smith',
        'HCL Noida',
        'UH12345',
        'Priya Sharma',
        '1992-05-15',
        'EMP001',
        'Priya Sharma',
        '9876543210',
        'priya@example.com',
        '123 Main Street, Delhi',
        'Trimester 1',
        'Antenatal',
        'Premium Maternity Package',
        'Dr. Kapoor',
        'Motherhood',
        'Noida Sector 18',
        'Dr. Mehta',
        'Connected',
        'Appointment Booked',
        '2025-12-15',
        '2025-12-20',
        'Very satisfied with the service',
        'Premium package enrollment',
      ],
      [
        '2025-12-05',
        'Maternity Basic',
        'Dr. Sharma',
        'HCL Mumbai',
        'UH12346',
        'Anjali Gupta',
        '1990-08-20',
        'EMP002',
        'Anjali Gupta',
        '8765432109',
        'anjali@example.com',
        '456 Park Avenue, Mumbai',
        'Trimester 2',
        'PreConception',
        'Basic Care Package',
        'Dr. Reddy',
        'Rainbow',
        'Mumbai Central',
        'Dr. Singh',
        'Follow Up Required',
        'Feedback Taken',
        '2025-12-20',
        '2025-12-25',
        'Good experience so far',
        'Basic package with add-ons',
      ],
      [
        '2025-12-10',
        'Wellness Complete',
        'Dr. Kumar',
        'HCL Bangalore',
        'UH12347',
        'Neha Verma',
        '1988-03-10',
        'EMP003',
        'Neha Verma',
        '7654321098',
        'neha@example.com',
        '789 Tech Park, Bangalore',
        'Trimester 3',
        'MaternityWellness',
        'Complete Wellness Package',
        'Dr. Patel',
        'Fortis',
        'Bangalore Whitefield',
        'Dr. Rao',
        'No Response',
        '',
        '',
        '',
        '',
        'Pending follow-up',
      ],
    ];

    // Build CSV content with proper escaping
    const csvContent = [
      headers.join(','),
      ...sampleRows.map((row) =>
        row.map((cell) => (cell.includes(',') || cell.includes('"') ? `"${cell.replace(/"/g, '""')}"` : cell)).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'enrollment_upload_sample.csv');
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
              accept=".csv"
              style={{ display: 'none' }}
            />
            <CloudUploadIcon sx={{ fontSize: 48, color: 'grey.400', mb: 2 }} />
            <Typography variant="body1" sx={{ mb: 1 }}>
              {selectedFile ? selectedFile.name : 'Click to select a file'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Supported format: CSV
            </Typography>
          </Paper>

          {result && (
            <Box sx={{ mt: 3, textAlign: 'left' }}>
              <Alert
                severity={
                  result.errors && result.errors.length > 0
                    ? result.created && result.created > 0
                      ? 'warning'
                      : 'error'
                    : 'success'
                }
                sx={{ mb: 2 }}
              >
                {result.message}
              </Alert>

              <Box sx={{ mb: 2 }}>
                <Typography variant="body2">
                  Total rows processed: <strong>{result.total_rows || 0}</strong>
                </Typography>
                <Typography variant="body2" color="success.main">
                  Enrollments created: <strong>{result.created || 0}</strong>
                </Typography>
                {result.errors && result.errors.length > 0 && (
                  <Typography variant="body2" color="error.main">
                    Failed entries: <strong>{result.errors.length}</strong>
                  </Typography>
                )}
              </Box>

              {result.errors && result.errors.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: 'error.main' }}>
                    Error Details
                  </Typography>
                  <Paper variant="outlined" sx={{ maxHeight: 200, overflow: 'auto', bgcolor: 'error.50' }}>
                    <List dense>
                      {result.errors.slice(0, 10).map((error, index) => (
                        <ListItem key={index}>
                          <ListItemText
                            primary={`Row ${error.row}: ${error.error}`}
                            primaryTypographyProps={{ variant: 'body2' }}
                          />
                        </ListItem>
                      ))}
                      {result.errors.length > 10 && (
                        <ListItem>
                          <ListItemText
                            primary={`... and ${result.errors.length - 10} more errors`}
                            primaryTypographyProps={{ color: 'text.secondary', variant: 'body2' }}
                          />
                        </ListItem>
                      )}
                    </List>
                  </Paper>
                </Box>
              )}
            </Box>
          )}

          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Required: At least one of UHID, Email, or Contact No.
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
