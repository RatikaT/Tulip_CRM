import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  Chip,
  Container,
  AppBar,
  Toolbar,
  IconButton,
  Menu,
  MenuItem,
  Avatar,
  Divider,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Person as PersonIcon,
  Logout as LogoutIcon,
  ArrowForward as ArrowForwardIcon,
} from '@mui/icons-material';
import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { CRM_TYPES, CRMType } from '../types/crm.types';

// Habit Health brand navy blue color
const BRAND_NAVY = '#1B3A6B';

// Gradient configurations for each CRM - complementing navy background
const crmGradients: Record<string, { background: string; shadow: string }> = {
  tulip: {
    background: 'linear-gradient(135deg, #8B5BA8 0%, #E94E77 100%)',
    shadow: '0 10px 40px rgba(139, 91, 168, 0.4)',
  },
  health_compass: {
    background: 'linear-gradient(135deg, #D4A574 0%, #E8D4B8 100%)',
    shadow: '0 10px 40px rgba(212, 165, 116, 0.4)',
  },
};

export default function CRMHomePage() {
  const navigate = useNavigate();
  const { user, logout, isSuperAdmin, hasAccessToCRM } = useAuthStore();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleProfileMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleCRMClick = (crm: CRMType) => {
    if (!crm.available) {
      navigate(`/${crm.id}`);
      return;
    }
    navigate(`/${crm.id}/dashboard`);
  };

  // Filter CRMs based on user access
  const accessibleCRMs = CRM_TYPES.filter((crm) => {
    if (isSuperAdmin()) return true;
    return hasAccessToCRM(crm.id);
  });

  return (
    <Box
      sx={{
        minHeight: '100vh',
        backgroundColor: BRAND_NAVY,
      }}
    >
      {/* App Bar */}
      <AppBar
        position="static"
        elevation={0}
        sx={{
          bgcolor: 'transparent',
          borderBottom: '1px solid rgba(255,255,255,0.15)',
        }}
      >
        <Toolbar>
          <Box sx={{ flexGrow: 1 }} />

          {/* User info and avatar */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ display: { xs: 'none', sm: 'block' }, textAlign: 'right' }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: '#fff' }}>
                {user?.full_name}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: 'rgba(255,255,255,0.7)', textTransform: 'capitalize' }}
              >
                {user?.role?.replace('_', ' ')}
              </Typography>
            </Box>
            <IconButton onClick={handleProfileMenuOpen} sx={{ p: 0 }}>
              <Avatar
                sx={{
                  bgcolor: 'rgba(255,255,255,0.2)',
                  border: '2px solid rgba(255,255,255,0.4)',
                  color: '#fff',
                }}
              >
                {user?.full_name?.charAt(0).toUpperCase()}
              </Avatar>
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Main Content */}
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          {/* HCL Healthcare Logo */}
          <Box
            component="img"
            src="/hcl-healthcare-white-logo.png"
            alt="HCL Healthcare"
            sx={{
              height: 60,
              mb: 3,
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))',
            }}
          />
          <Typography
            variant="h3"
            component="h1"
            sx={{
              fontWeight: 700,
              color: '#ffffff',
              mb: 2,
              letterSpacing: '-0.5px',
            }}
          >
            CRM - Lead Management System
          </Typography>
          <Typography
            variant="h6"
            sx={{
              color: 'rgba(255,255,255,0.85)',
              fontWeight: 400,
              maxWidth: 500,
              mx: 'auto',
            }}
          >
            Select a CRM module to get started
          </Typography>
        </Box>

        <Grid container spacing={4} justifyContent="center">
          {accessibleCRMs.map((crm) => {
            const gradient = crmGradients[crm.id] || crmGradients.tulip;
            return (
              <Grid item xs={12} sm={6} md={5} key={crm.id}>
                <Card
                  sx={{
                    height: '100%',
                    background: gradient.background,
                    borderRadius: 4,
                    transition: 'all 0.3s ease',
                    boxShadow: gradient.shadow,
                    border: '1px solid rgba(255,255,255,0.1)',
                    overflow: 'hidden',
                    position: 'relative',
                    '&:hover': {
                      transform: 'translateY(-8px) scale(1.02)',
                      boxShadow: `${gradient.shadow}, 0 20px 60px rgba(0,0,0,0.3)`,
                    },
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background:
                        'linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 100%)',
                      pointerEvents: 'none',
                    },
                    opacity: crm.available ? 1 : 0.7,
                  }}
                >
                  <CardActionArea
                    onClick={() => handleCRMClick(crm)}
                    sx={{ height: '100%', p: 0 }}
                  >
                    <CardContent
                      sx={{
                        textAlign: 'center',
                        py: 6,
                        px: 4,
                        position: 'relative',
                        zIndex: 1,
                      }}
                    >
                      <Typography
                        variant="h3"
                        component="h2"
                        sx={{
                          fontWeight: 800,
                          color: '#ffffff',
                          mb: 2,
                          letterSpacing: '-1px',
                          textShadow: '0 2px 20px rgba(0,0,0,0.2)',
                        }}
                      >
                        {crm.name}
                      </Typography>

                      <Typography
                        variant="body1"
                        sx={{
                          color: 'rgba(255,255,255,0.85)',
                          mb: 3,
                          fontSize: '1.1rem',
                        }}
                      >
                        {crm.description}
                      </Typography>

                      {!crm.available ? (
                        <Chip
                          label="Coming Soon"
                          sx={{
                            bgcolor: 'rgba(255,255,255,0.2)',
                            color: '#fff',
                            fontWeight: 600,
                            px: 2,
                            backdropFilter: 'blur(10px)',
                          }}
                        />
                      ) : (
                        <Box
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 1,
                            color: '#fff',
                            fontWeight: 600,
                            mt: 1,
                          }}
                        >
                          <Typography variant="button" sx={{ fontSize: '1rem' }}>
                            Get Started
                          </Typography>
                          <ArrowForwardIcon sx={{ fontSize: 20 }} />
                        </Box>
                      )}
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            );
          })}
        </Grid>

        {accessibleCRMs.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.85)' }}>
              No CRM modules available for your account.
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
              Please contact your administrator for access.
            </Typography>
          </Box>
        )}
      </Container>

      {/* Profile Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleProfileMenuClose}
        PaperProps={{
          sx: {
            width: 220,
            mt: 1.5,
            bgcolor: '#122850',
            border: '1px solid rgba(255,255,255,0.15)',
            boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle2" sx={{ color: '#fff', fontWeight: 600 }}>
            {user?.full_name}
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
            {user?.email}
          </Typography>
        </Box>
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.15)' }} />
        <MenuItem
          onClick={() => {
            handleProfileMenuClose();
          }}
          sx={{
            color: 'rgba(255,255,255,0.9)',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
          }}
        >
          <ListItemIcon>
            <PersonIcon fontSize="small" sx={{ color: 'rgba(255,255,255,0.8)' }} />
          </ListItemIcon>
          <ListItemText>Profile</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={handleLogout}
          sx={{
            color: 'rgba(255,255,255,0.9)',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
          }}
        >
          <ListItemIcon>
            <LogoutIcon fontSize="small" sx={{ color: 'rgba(255,255,255,0.8)' }} />
          </ListItemIcon>
          <ListItemText>Logout</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
}
