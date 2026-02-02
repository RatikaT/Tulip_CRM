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
import DownloadIcon from '@mui/icons-material/Download';
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
        toast.error('Please upload a CSV file');
      }
    }
  }, []);

  const isValidFile = (file: File) => {
    const validTypes = ['text/csv', 'application/vnd.ms-excel'];
    return validTypes.includes(file.type) || file.name.endsWith('.csv');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (isValidFile(selectedFile)) {
        setFile(selectedFile);
        setResult(null);
      } else {
        toast.error('Please upload a CSV file');
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

      // Show appropriate toast based on results
      const { created = 0, errors = [] } = response.data;
      if (created > 0 && errors.length === 0) {
        toast.success(`Successfully imported ${created} leads`);
      } else if (created > 0 && errors.length > 0) {
        toast.warning(`Imported ${created} leads. ${errors.length} entries failed.`);
      } else if (created === 0 && errors.length > 0) {
        toast.error(`Upload failed. ${errors.length} entries had errors.`);
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

  const handleDownloadSampleCSV = () => {
    // CSV headers matching backend field expectations
    const headers = [
      'name',
      'phone_number',
      'email',
      'uhid',
      'lead_source',
      'status',
      'trimester',
      'looking_for',
      'family_member_relation',
      'employee_id',
      'city',
      'pin_code',
      'address',
      'user_facility',
      'package_requested',
      'service_requested',
      'service_partner',
      'provider_location',
      'reason_for_no_sale',
      'doctor_name',
      'doctor_speciality',
      'consult_date',
      'lead_creation_date',
      'follow_up_date',
      'alternate_mobile_number',
      'visit_id',
      'age',
      'gender',
      'icd_code',
      'diagnosis',
      'investigation_item_name',
      'investigation_service_type',
      'cug_name',
    ];

    // Sample data rows with realistic examples
    const sampleRows = [
      [
        'Priya Sharma',
        '9876543210',
        'priya@example.com',
        'UH12345',
        'Website',
        'Enquiry Lead',
        'Trimester 1',
        'Self',
        '',
        'EMP001',
        'Delhi',
        '110001',
        '123 Main Street',
        'HCL Noida',
        'Maternity Premium',
        'Antenatal',
        'Motherhood',
        'Noida Sector 18',
        '',
        'Dr. Kapoor',
        'Gynaecology',
        '2025-12-25',
        '2025-12-28',
        '2025-12-30T10:00:00',
        '',
        'V001',
        '28',
        'Female',
        '',
        '',
        '',
        '',
        '',
      ],
      [
        'Anjali Gupta',
        '8765432109',
        'anjali@example.com',
        'UH12346',
        'Call',
        'Follow up-In Process',
        'Trimester 2',
        'Family Member',
        'Wife',
        'EMP002',
        'Mumbai',
        '400001',
        '456 Park Avenue',
        'HCL Mumbai',
        'Maternity Basic',
        'PreConception',
        'Rainbow',
        'Mumbai Central',
        '',
        'Dr. Mehta',
        'Obstetrics',
        '2025-12-26',
        '2025-12-27',
        '2025-12-29T14:30:00',
        '9988776655',
        'V002',
        '32',
        'Female',
        'Z34.0',
        'Normal pregnancy',
        '',
        '',
        'CUG01',
      ],
      [
        '',
        '',
        'neha@example.com',
        'UH12347',
        'In Clinic-Walk In',
        'Not Interested',
        'Not Conceived',
        'Self',
        '',
        '',
        'Bangalore',
        '560001',
        '',
        '',
        '',
        '',
        '',
        '',
        'Package Cost',
        'Dr. Reddy',
        'General Medicine',
        '2025-12-25',
        '',
        '',
        '',
        '',
        '25',
        'Female',
        '',
        '',
        '',
        '',
        '',
      ],
    ];

    // Build CSV content
    const csvContent = [
      headers.join(','),
      ...sampleRows.map((row) =>
        row.map((cell) => (cell.includes(',') || cell.includes('"') ? `"${cell.replace(/"/g, '""')}"` : cell)).join(',')
      ),
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'leads_sample_template.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    toast.success('Sample CSV downloaded');
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          Bulk Upload Leads
        </Typography>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={handleDownloadSampleCSV}
          color="primary"
        >
          Download Sample CSV
        </Button>
      </Box>

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
          accept=".csv"
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
          Supported format: CSV
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
              Leads created: <strong>{result.created || 0}</strong>
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
              <List dense sx={{ bgcolor: 'error.50', borderRadius: 1 }}>
                {result.errors.slice(0, 10).map((err, idx) => (
                  <ListItem key={idx}>
                    <ListItemIcon>
                      <ErrorIcon color="error" fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary={`Row ${err.row}: ${err.error}`}
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

        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2">
            <strong>Required:</strong> At least one of <strong>UHID</strong>, <strong>Contact No. (phone_number)</strong>, or <strong>Email</strong> must be provided for each row.
          </Typography>
        </Alert>

        <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, fontWeight: 600, color: 'primary.main' }}>
          Identifier Fields (at least one required):
        </Typography>
        <Box component="ul" sx={{ pl: 2, mb: 2 }}>
          <li><Typography variant="body2"><strong>uhid</strong> - UHID</Typography></li>
          <li><Typography variant="body2"><strong>phone_number</strong> - Contact No. (10 digit mobile number starting with 6-9)</Typography></li>
          <li><Typography variant="body2"><strong>email</strong> - Email address</Typography></li>
        </Box>

        <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, fontWeight: 600 }}>
          Other Fields (all optional):
        </Typography>
        <Box component="ul" sx={{ pl: 2 }}>
          <li><Typography variant="body2"><strong>name</strong> - Lead's full name (defaults to "Unknown" if not provided)</Typography></li>
          <li><Typography variant="body2"><strong>lead_source</strong> - Prescription Dump, In Clinic-Gynae Consult, In Clinic-Other Consults, In Clinic-Walk In, AMA, BEWELL, Events, Call, Others, Bump Day, WhatsApp, Mail, Tele-Consultation, Website, Habit Banner</Typography></li>
          <li><Typography variant="body2"><strong>status</strong> - Not Interested, Enquiry Lead, Lead Closed-No Response, Enrolled, Follow up-In Process, Follow up-No Response, Duplicate</Typography></li>
          <li><Typography variant="body2"><strong>trimester</strong> - Trimester 1, Trimester 2, Trimester 3, Not Conceived</Typography></li>
          <li><Typography variant="body2"><strong>looking_for</strong> - Self, Family Member</Typography></li>
          <li><Typography variant="body2"><strong>family_member_relation</strong> - Relation (e.g., Mother, Daughter, Sister, Wife)</Typography></li>
          <li><Typography variant="body2"><strong>employee_id</strong> - Employee ID</Typography></li>
          <li><Typography variant="body2"><strong>city</strong> - City name</Typography></li>
          <li><Typography variant="body2"><strong>pin_code</strong> - PIN code</Typography></li>
          <li><Typography variant="body2"><strong>address</strong> - Full address</Typography></li>
          <li><Typography variant="body2"><strong>user_facility</strong> - Facility Name</Typography></li>
          <li><Typography variant="body2"><strong>package_requested</strong> - Package name requested</Typography></li>
          <li><Typography variant="body2"><strong>service_requested</strong> - Service Requested (PreConception, Antenatal, MaternityWellness)</Typography></li>
          <li><Typography variant="body2"><strong>service_partner</strong> - Service Partner (Motherhood, Rainbow, Fortis, Apollo Cradle, Cloud 9, HCL Healthcare, Mamily, Others)</Typography></li>
          <li><Typography variant="body2"><strong>provider_location</strong> - Partner Center location</Typography></li>
          <li><Typography variant="body2"><strong>reason_for_no_sale</strong> - Already Taking Service outside, Location not suitable, Different Service Provider Required-Brand, Travelling to Native Place for delivery, Package Cost, Only Delivery Package required, Package inadequate, Miscarriage, Looking for other HCLH services, Others</Typography></li>
          <li><Typography variant="body2"><strong>doctor_name</strong> - Treating Doctor Name</Typography></li>
          <li><Typography variant="body2"><strong>doctor_speciality</strong> - Doctor Speciality/Department</Typography></li>
          <li><Typography variant="body2"><strong>consult_date</strong> - Consultation date (YYYY-MM-DD)</Typography></li>
          <li><Typography variant="body2"><strong>lead_creation_date</strong> - Lead creation date (YYYY-MM-DD)</Typography></li>
          <li><Typography variant="body2"><strong>follow_up_date</strong> - Follow up date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)</Typography></li>
          <li><Typography variant="body2"><strong>alternate_mobile_number</strong> - Alternate contact number</Typography></li>
          <li><Typography variant="body2"><strong>visit_id</strong> - Visit ID</Typography></li>
          <li><Typography variant="body2"><strong>age</strong> - Age (number)</Typography></li>
          <li><Typography variant="body2"><strong>gender</strong> - Gender (Male, Female, Other)</Typography></li>
          <li><Typography variant="body2"><strong>icd_code</strong> - ICD Code</Typography></li>
          <li><Typography variant="body2"><strong>diagnosis</strong> - Diagnosis</Typography></li>
          <li><Typography variant="body2"><strong>investigation_item_name</strong> - Investigation Item Name</Typography></li>
          <li><Typography variant="body2"><strong>investigation_service_type</strong> - Investigation Service Type</Typography></li>
          <li><Typography variant="body2"><strong>cug_name</strong> - CUG Name</Typography></li>
        </Box>

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Note:</strong> Only CSV files are supported. If Contact No. is provided, it must be a valid 10-digit number starting with 6-9.
          </Typography>
        </Alert>
      </Paper>
    </Box>
  );
}
