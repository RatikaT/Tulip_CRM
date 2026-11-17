import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { enrollmentService } from '../../services/enrollmentService';
import { Enrollment } from '../../types/enrollment.types';
import { formatDateIST } from '../../utils/dateUtils';
import { brandColors } from '../../theme';

interface CustomerServicesSectionProps {
  enrollmentId: string;
  /** SPOC of the source enrollment, prefilled into the Add Service modal. */
  currentSpoc?: string | null;
  /** Called after a service is added, so the parent can refresh if needed. */
  onServiceAdded?: () => void;
}

function journeyProgress(e: Enrollment): string {
  const steps = e.journey || [];
  if (steps.length === 0) return '—';
  const done = steps.filter((s) => s.status === 'done').length;
  return `${done}/${steps.length}`;
}

// Lists every service this customer has. ("Add Service" was removed on request.)
export default function CustomerServicesSection({
  enrollmentId,
}: CustomerServicesSectionProps) {
  const [services, setServices] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await enrollmentService.getCustomerServices(enrollmentId);
      setServices(res.services || []);
    } catch (error) {
      console.error('Failed to load customer services:', error);
    } finally {
      setLoading(false);
    }
  }, [enrollmentId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Box sx={{ mt: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography fontWeight={600}>
          Services{services.length > 0 ? ` (${services.length})` : ''}
        </Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={22} />
        </Box>
      ) : services.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
          No services found for this customer.
        </Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Service Enrolled</TableCell>
              <TableCell>Package Billed</TableCell>
              <TableCell>Billed Date</TableCell>
              <TableCell>Trimester</TableCell>
              <TableCell>HCLH SPOC (Nurture Buddy)</TableCell>
              <TableCell>Care Progress</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {services.map((s) => {
              const isCurrent = s.enrollment_id === enrollmentId;
              return (
                <TableRow key={s.enrollment_id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {isCurrent ? (
                        <Typography variant="body2" fontWeight={600}>
                          {s.service_enrolled || '—'}
                        </Typography>
                      ) : (
                        <RouterLink
                          to={`/tulip/enrollments/${s.enrollment_id}`}
                          style={{ color: brandColors.navyBlue, fontWeight: 500 }}
                        >
                          {s.service_enrolled || '—'}
                        </RouterLink>
                      )}
                      {isCurrent && <Chip label="This" size="small" color="primary" variant="outlined" />}
                    </Box>
                    <Tooltip title={s.enrollment_id}>
                      <Typography variant="caption" color="text.secondary">
                        {s.enrollment_id}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell>{s.package_billed || '—'}</TableCell>
                  <TableCell>{s.billed_date ? formatDateIST(s.billed_date) : '—'}</TableCell>
                  <TableCell>{s.trimester || '—'}</TableCell>
                  <TableCell>{s.hclhc_spoc || '—'}</TableCell>
                  <TableCell>{journeyProgress(s)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

    </Box>
  );
}
