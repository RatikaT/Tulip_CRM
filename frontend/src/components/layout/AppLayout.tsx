import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  CssBaseline,
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  People as LeadsIcon,
  CloudUpload as UploadIcon,
  Summarize as SummaryIcon,
  Person as PersonIcon,
  Logout as LogoutIcon,
  Settings as SettingsIcon,
  MenuBook as KnowledgeBaseIcon,
  Home as HomeIcon,
} from '@mui/icons-material';
import { useAuthStore } from '../../stores/authStore';
import { brandColors } from '../../theme';

const DRAWER_WIDTH = 270;

interface NavItem {
  title: string;
  path: string;
  icon: React.ReactElement;
  adminOnly?: boolean;
  isAbsolute?: boolean;
}

const navItems: NavItem[] = [
  { title: 'Home', path: '/', icon: <HomeIcon />, isAbsolute: true },
  { title: 'Dashboard', path: '/tulip/dashboard', icon: <DashboardIcon /> },
  { title: 'Leads', path: '/tulip/leads', icon: <LeadsIcon /> },
  { title: 'Bulk Upload', path: '/tulip/bulk-upload', icon: <UploadIcon />, adminOnly: true },
  { title: 'Summaries', path: '/tulip/summaries', icon: <SummaryIcon /> },
  { title: 'Knowledge Base', path: '/tulip/knowledge-base', icon: <KnowledgeBaseIcon /> },
  { title: 'Configurations', path: '/tulip/configurations', icon: <SettingsIcon />, adminOnly: true },
];

export default function AppLayout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

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

  const filteredNavItems = navItems.filter(item => !item.adminOnly || isAdmin);

  const drawer = (
    <Box sx={{ bgcolor: brandColors.navyBlue, minHeight: '100%', color: '#fff' }}>
      <Toolbar sx={{ px: 2, py: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
          {/* Tulip Logo */}
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <img
              src="/tulip-logo.png"
              alt="Tulip"
              style={{ height: '40px', width: 'auto' }}
            />
          </Box>
          <Typography
            variant="caption"
            sx={{
              color: 'rgba(255,255,255,0.7)',
              fontSize: '0.7rem',
              display: 'block',
              mt: 0.5,
            }}
          >
            Lead Management System
          </Typography>
        </Box>
      </Toolbar>
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

      <List sx={{ px: 2, pt: 2 }}>
        {filteredNavItems.map((item) => (
          <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              onClick={() => {
                navigate(item.path);
                if (isMobile) setMobileOpen(false);
              }}
              selected={item.isAbsolute ? location.pathname === item.path : location.pathname.startsWith(item.path)}
              sx={{
                borderRadius: 2,
                color: 'rgba(255,255,255,0.85)',
                '&:hover': {
                  bgcolor: 'rgba(255,255,255,0.1)',
                },
                '&.Mui-selected': {
                  bgcolor: '#fff',
                  color: brandColors.navyBlue,
                  '&:hover': {
                    bgcolor: 'rgba(255,255,255,0.9)',
                  },
                  '& .MuiListItemIcon-root': {
                    color: brandColors.navyBlue,
                  },
                },
                '& .MuiListItemIcon-root': {
                  color: 'rgba(255,255,255,0.85)',
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.title} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      {/* Powered by HCL Healthcare */}
      <Box sx={{ px: 2, mt: 'auto', pt: 4, mb: 2 }}>
        <Box
          sx={{
            bgcolor: 'rgba(255,255,255,0.15)',
            borderRadius: 2,
            py: 1.5,
            px: 2,
            textAlign: 'center',
          }}
        >
          <Typography
            variant="caption"
            sx={{
              color: 'rgba(255,255,255,0.7)',
              display: 'block',
              mb: 1,
              fontSize: '11px',
            }}
          >
            Powered by
          </Typography>
          {/* HCL Healthcare White Logo */}
          <img
            src="/hcl-healthcare-white-logo.png"
            alt="HCL Healthcare"
            style={{ height: '40px', width: 'auto' }}
          />
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />

      {/* App Bar */}
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
          bgcolor: brandColors.navyBlue,
          color: '#fff',
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>

          <Box sx={{ flexGrow: 1 }} />

          {/* User info and avatar */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ display: { xs: 'none', sm: 'block' }, textAlign: 'right' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {user?.full_name}
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', textTransform: 'capitalize' }}>
                {user?.role?.replace('_', ' ')}
              </Typography>
            </Box>
            <Tooltip title="Profile">
              <IconButton onClick={handleProfileMenuOpen} sx={{ p: 0 }}>
                <Avatar sx={{ bgcolor: brandColors.orange }}>
                  {user?.full_name?.charAt(0).toUpperCase()}
                </Avatar>
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Navigation Drawer */}
      <Box
        component="nav"
        sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}
        aria-label="navigation"
      >
        {/* Mobile drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
            },
          }}
        >
          {drawer}
        </Drawer>

        {/* Desktop drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
              borderRight: '1px solid',
              borderColor: theme.palette.divider,
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          minHeight: '100vh',
          bgcolor: theme.palette.background.default,
        }}
      >
        <Toolbar />
        <Outlet />
      </Box>

      {/* Profile Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleProfileMenuClose}
        PaperProps={{
          sx: { width: 200, mt: 1.5 },
        }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2">{user?.full_name}</Typography>
          <Typography variant="caption" color="text.secondary">
            {user?.email}
          </Typography>
        </Box>
        <Divider />
        <MenuItem onClick={() => { handleProfileMenuClose(); }}>
          <ListItemIcon>
            <PersonIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Profile</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleLogout}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Logout</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
}
