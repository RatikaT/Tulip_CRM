import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import { toast } from 'react-toastify';
import { enrollmentService } from '../../services/enrollmentService';
import { JourneyStateBulkResult } from '../../types/enrollment.types';

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  /** Show the "Interested in Antenatal – lead not created" list. */
  onShowAntenatalPending: () => void;
}

const errDetail = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;

/** Admin: update Journey Status of many enrollments from an Excel file. */
export default function JourneyStatusBulkModal({ open, onClose, onDone, onShowAntenatalPending }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<'template' | 'upload' | null>(null);
  const [result, setResult] = useState<JourneyStateBulkResult | null>(null);

  const close = () => {
    if (busy) return;
    setFile(null);
    setResult(null);
    onClose();
  };

  const downloadTemplate = async () => {
    setBusy('template');
    try {
      const blob = await enrollmentService.journeyStateTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'journey_status_bulk_update.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errDetail(e, 'Failed to download the template'));
    } finally {
      setBusy(null);
    }
  };

  const upload = async () => {
    if (!file) return;
    setBusy('upload');
    try {
      const res = await enrollmentService.journeyStateBulkUpload(file);
      setResult(res);
      if (res.updated) onDone();
    } catch (e) {
      toast.error(errDetail(e, 'Upload failed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>Bulk update Journey Status</DialogTitle>
      <DialogContent>
        {!result ? (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              The template lists every enrollment with its current Journey Status. Change the <b>Journey Status</b>{' '}
              column (and <b>Others – description</b> for an "Others" status), then upload it. Only the Journey Status
              changes. Each change is recorded in the history as "Bulk upload" with your name.
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, typography: 'body2', color: 'text.secondary' }}>
              <li>The status must be one of the values for that customer's service (see the "Allowed values" sheet).</li>
              <li>A Closed status stops the care journey, the same as choosing it on screen.</li>
              <li>
                "Pregnant – Interested in Antenatal program" only records the status. The Antenatal lead is created
                from the Enrollments list or the enrollment page.
              </li>
              <li>Rows you leave unchanged are skipped.</li>
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
              <Button variant="outlined" startIcon={<DownloadIcon />} onClick={downloadTemplate} disabled={!!busy}>
                {busy === 'template' ? 'Preparing…' : 'Download template'}
              </Button>
              <Button variant="outlined" component="label" startIcon={<UploadIcon />} disabled={!!busy}>
                Choose file
                <input
                  hidden
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </Button>
              <Typography variant="body2" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
                {file ? file.name : 'No file chosen'}
              </Typography>
            </Stack>
          </Stack>
        ) : (
          <Stack spacing={2}>
            <Alert severity={result.failed.length ? 'warning' : 'success'}>
              <b>{result.updated}</b> updated · {result.unchanged} already had that status · <b>{result.failed.length}</b> failed
            </Alert>
            {result.antenatal_pending.length > 0 && (
              <Alert
                severity="info"
                action={
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => {
                      onShowAntenatalPending();
                      close();
                    }}
                  >
                    Show them
                  </Button>
                }
              >
                Antenatal lead pending: <b>{result.antenatal_pending.length}</b>. These customers are interested in the
                Antenatal program; their SPOCs create the leads from the Enrollments list.
              </Alert>
            )}
            {result.failed.length > 0 && (
              <Box sx={{ maxHeight: 320, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 2 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Row</TableCell>
                      <TableCell>Enrollment ID</TableCell>
                      <TableCell>Why it failed</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.failed.map((f) => (
                      <TableRow key={`${f.row}-${f.enrollment_id}`}>
                        <TableCell>{f.row}</TableCell>
                        <TableCell>{f.enrollment_id || '—'}</TableCell>
                        <TableCell>{f.error}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={close} disabled={!!busy}>
          {result ? 'Close' : 'Cancel'}
        </Button>
        {!result && (
          <Button variant="contained" onClick={upload} disabled={!file || !!busy}>
            {busy === 'upload' ? <CircularProgress size={18} /> : 'Upload'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
