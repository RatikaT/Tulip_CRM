import { useState, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Alert,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ErrorIcon from '@mui/icons-material/Error';
import DescriptionIcon from '@mui/icons-material/Description';
import { toast } from 'react-toastify';
import api from '../services/api';

interface UploadResult {
  success: boolean;
  message: string;
  total_rows?: number;
  created?: number;
  errors?: Array<{ row: number; error: string }>;
}

export default function BulkUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (isValidFile(droppedFile)) {
        setFile(droppedFile);
        setResult(null);
      } else {
        toast.error('Please upload a CSV or Excel file');
      }
    }
  }, []);

  const isValidFile = (file: File) => {
    const validTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    return validTypes.includes(file.type) || file.name.endsWith('.csv') || file.name.endsWith('.xlsx');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (isValidFile(selectedFile)) {
        setFile(selectedFile);
        setResult(null);
      } else {
        toast.error('Please upload a CSV or Excel file');
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await api.post<UploadResult>('/leads/bulk-upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setResult(response.data);
      if (response.data.success) {
        toast.success(`Successfully imported ${response.data.created} leads`);
      }
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to upload file';
      toast.error(message);
      setResult({ success: false, message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>
        Bulk Upload Leads
      </Typography>

      <Paper
        sx={{
          p: 4,
          mb: 3,
          border: dragActive ? '2px dashed #1976d2' : '2px dashed #ccc',
          backgroundColor: dragActive ? '#e3f2fd' : 'transparent',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".csv,.xlsx"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        <CloudUploadIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
        <Typography variant="h6" gutterBottom>
          Drag & drop your file here
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          or click to browse
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Supported formats: CSV, Excel (.xlsx)
        </Typography>
      </Paper>

      {file && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <DescriptionIcon color="primary" />
              <Box>
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  {file.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {(file.size / 1024).toFixed(2)} KB
                </Typography>
              </Box>
            </Box>
            <Button
              variant="contained"
              onClick={handleUpload}
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
          </Box>
          {uploading && <LinearProgress sx={{ mt: 2 }} />}
        </Paper>
      )}

      {result && (
        <Paper sx={{ p: 3 }}>
          <Alert severity={result.success ? 'success' : 'error'} sx={{ mb: 2 }}>
            {result.message}
          </Alert>

          {result.success && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2">
                Total rows processed: <strong>{result.total_rows}</strong>
              </Typography>
              <Typography variant="body2">
                Leads created: <strong>{result.created}</strong>
              </Typography>
            </Box>
          )}

          {result.errors && result.errors.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                Errors ({result.errors.length})
              </Typography>
              <List dense>
                {result.errors.slice(0, 10).map((err, idx) => (
                  <ListItem key={idx}>
                    <ListItemIcon>
                      <ErrorIcon color="error" fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary={`Row ${err.row}: ${err.error}`}
                    />
                  </ListItem>
                ))}
                {result.errors.length > 10 && (
                  <ListItem>
                    <ListItemText
                      primary={`... and ${result.errors.length - 10} more errors`}
                      sx={{ color: 'text.secondary' }}
                    />
                  </ListItem>
                )}
              </List>
            </Box>
          )}
        </Paper>
      )}

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          File Format Requirements
        </Typography>
        <Typography variant="body2" paragraph>
          Your CSV file should have the following columns (first row must be headers):
        </Typography>

        <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, fontWeight: 600, color: 'error.main' }}>
          Required Fields:
        </Typography>
        <Box component="ul" sx={{ pl: 2, mb: 2 }}>
          <li><Typography variant="body2"><strong>name</strong> - Lead's full name</Typography></li>
          <li><Typography variant="body2"><strong>phone_number</strong> - 10 digit mobile number (starting with 6-9)</Typography></li>
        </Box>

        <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, fontWeight: 600 }}>
          Optional Fields:
        </Typography>
        <Box component="ul" sx={{ pl: 2 }}>
          <li><Typography variant="body2"><strong>email</strong> - Email address</Typography></li>
          <li><Typography variant="body2"><strong>lead_source</strong> - Mail, Website, WA, Call, SMS, EMR, Other</Typography></li>
          <li><Typography variant="body2"><strong>status</strong> - New, Interested, Not Interested, No Response, FollowUp Required, Lead Closed - No Response</Typography></li>
          <li><Typography variant="body2"><strong>stage</strong> - Pregnant - 1st, Pregnant - 2nd, Pregnant - 3rd, PlanningForPregnancy, NewMom, Exploring</Typography></li>
          <li><Typography variant="body2"><strong>looking_for</strong> - Self, Family Member</Typography></li>
          <li><Typography variant="body2"><strong>employee_id</strong> - Employee ID</Typography></li>
          <li><Typography variant="body2"><strong>uhid</strong> - UHID</Typography></li>
          <li><Typography variant="body2"><strong>city</strong> - City name</Typography></li>
          <li><Typography variant="body2"><strong>pin_code</strong> - PIN code</Typography></li>
          <li><Typography variant="body2"><strong>address</strong> - Full address</Typography></li>
          <li><Typography variant="body2"><strong>user_facility</strong> - HCL facility name</Typography></li>
          <li><Typography variant="body2"><strong>package_requested</strong> - Package name requested</Typography></li>
          <li><Typography variant="body2"><strong>service_enrolled</strong> - PreConception, Antenatal, MaternityWellness</Typography></li>
          <li><Typography variant="body2"><strong>package_name_enrolled</strong> - Enrolled package name</Typography></li>
          <li><Typography variant="body2"><strong>provider_name</strong> - Provider name</Typography></li>
          <li><Typography variant="body2"><strong>provider_location</strong> - Provider location</Typography></li>
          <li><Typography variant="body2"><strong>hclhc_spoc</strong> - HCLHC SPOC name</Typography></li>
          <li><Typography variant="body2"><strong>doctor_name</strong> - Doctor name</Typography></li>
          <li><Typography variant="body2"><strong>consult_date</strong> - Consultation date (YYYY-MM-DD)</Typography></li>
          <li><Typography variant="body2"><strong>lead_creation_date</strong> - Lead creation date (YYYY-MM-DD)</Typography></li>
          <li><Typography variant="body2"><strong>follow_up_date</strong> - Follow up date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)</Typography></li>
        </Box>

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Note:</strong> Duplicate phone numbers will be skipped. Only CSV files are supported.
          </Typography>
        </Alert>
      </Paper>
    </Box>
  );
}
