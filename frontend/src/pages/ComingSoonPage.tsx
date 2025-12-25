import { useNavigate, useParams } from 'react-router-dom';
import { Box, Typography, Button, Container } from '@mui/material';
import { Home as HomeIcon, Construction as ConstructionIcon } from '@mui/icons-material';
import { getCRMById } from '../types/crm.types';
import { brandColors } from '../theme';

export default function ComingSoonPage() {
  const navigate = useNavigate();
  const { crmId } = useParams<{ crmId: string }>();

  const crm = crmId ? getCRMById(crmId) : null;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: '#f5f5f5',
      }}
    >
      <Container maxWidth="sm">
        <Box sx={{ textAlign: 'center' }}>
          <Box
            sx={{
              width: 120,
              height: 120,
              borderRadius: '50%',
              bgcolor: `${brandColors.orange}15`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 4,
            }}
          >
            <ConstructionIcon sx={{ fontSize: 60, color: brandColors.orange }} />
          </Box>

          <Typography variant="h3" component="h1" gutterBottom fontWeight={600}>
            Coming Soon
          </Typography>

          {crm && (
            <Typography variant="h5" color="primary" gutterBottom>
              {crm.name}
            </Typography>
          )}

          <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
            We're working hard to bring you this feature. Stay tuned for updates!
          </Typography>

          <Button
            variant="contained"
            size="large"
            startIcon={<HomeIcon />}
            onClick={() => navigate('/')}
            sx={{
              bgcolor: brandColors.navyBlue,
              '&:hover': {
                bgcolor: brandColors.navyBlue,
                opacity: 0.9,
              },
            }}
          >
            Back to Home
          </Button>
        </Box>
      </Container>
    </Box>
  );
}
