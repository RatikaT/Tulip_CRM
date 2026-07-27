import { useState, useEffect } from 'react';
import {
  Paper,
  Box,
  Typography,
  Chip,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Badge,
  Divider,
} from '@mui/material';
import CakeIcon from '@mui/icons-material/Cake';
import { enrollmentService } from '../../services/enrollmentService';
import { BirthdayItem } from '../../types/enrollment.types';

/**
 * Internal reminder widget: enrolled customers whose birthday is today (IST),
 * so staff can wish them. Content is scoped per role by the server. Recomputes
 * on mount — no scheduler, no persistence, and never messages customers.
 */
export default function BirthdaysTodayWidget() {
  const [birthdays, setBirthdays] = useState<BirthdayItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await enrollmentService.getBirthdaysToday();
        if (active) setBirthdays(res.birthdays || []);
      } catch (error) {
        console.error('Failed to load birthdays:', error);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        boxShadow: '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Badge badgeContent={birthdays.length} color="secondary" showZero={false}>
          <CakeIcon sx={{ color: '#d81b60' }} />
        </Badge>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Birthdays Today
        </Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={22} />
        </Box>
      ) : birthdays.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
          No customer birthdays today.
        </Typography>
      ) : (
        <>
          <Typography variant="caption" color="text.secondary">
            Give them a call to wish them 🎉
          </Typography>
          <List dense sx={{ mt: 0.5 }}>
            {birthdays.map((b, idx) => (
              <Box key={b.enrollment_id}>
                {idx > 0 && <Divider component="li" />}
                <ListItem
                  disableGutters
                  secondaryAction={
                    b.service_enrolled ? (
                      <Chip label={b.service_enrolled} size="small" variant="outlined" />
                    ) : null
                  }
                >
                  <ListItemText
                    primary={b.name || 'Unnamed customer'}
                    secondary={
                      [b.phone_number, b.hclhc_spoc ? `SPOC: ${b.hclhc_spoc}` : null]
                        .filter(Boolean)
                        .join('  ·  ') || undefined
                    }
                    primaryTypographyProps={{ fontWeight: 500 }}
                  />
                </ListItem>
              </Box>
            ))}
          </List>
        </>
      )}
    </Paper>
  );
}
