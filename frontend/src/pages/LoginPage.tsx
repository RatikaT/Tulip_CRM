import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  CircularProgress,
  InputAdornment,
  IconButton,
  LinearProgress,
  Alert,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { toast } from 'react-toastify';
import { useAuthStore } from '../stores/authStore';
import { authService } from '../services/authService';
import { theme as designTheme } from '../styles/theme';
import { brandColors } from '../theme';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, setAuth } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (data: LoginFormData) => {
    console.log('Login attempt:', data.email);
    setIsLoading(true);
    setError('');
    try {
      const response = await authService.login(data);
      console.log('Login successful:', response.user.email);
      setAuth(response.access_token, response.user);
      toast.success(`Welcome back, ${response.user.full_name}!`);
      navigate('/');
    } catch (error: unknown) {
      console.error('Login error:', error);
      const err = error as { response?: { data?: { detail?: string }; status?: number }; message?: string };
      const message = err?.response?.data?.detail || err?.message || 'Invalid credentials. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        backgroundColor: designTheme.colors.background,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontFamily: designTheme.typography.fontFamily,
        padding: { xs: '48px 24px', md: '96px 24px' },
      }}
    >
      {/* HCL Healthcare Logo */}
      <Box sx={{ mb: 3 }}>
        <img
          src="/hcl-healthcare-logo.png"
          alt="HCL Healthcare"
          style={{ height: '50px', objectFit: 'contain' }}
        />
      </Box>

      {/* CRM Title */}
      <Box sx={{ textAlign: 'center', mb: 5 }}>
        <Typography
          variant="h3"
          sx={{
            fontWeight: 700,
            color: brandColors.navyBlue,
            lineHeight: 1.2,
            letterSpacing: '-0.5px',
          }}
        >
          CRM
        </Typography>
        <Typography
          variant="subtitle1"
          sx={{
            color: designTheme.colors.textSecondary,
            fontWeight: 500,
            mt: 1,
            letterSpacing: '1px',
            fontSize: '0.95rem',
          }}
        >
          Lead Management System
        </Typography>
      </Box>

      {/* Login Card */}
      <Paper
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: '480px',
          backgroundColor: designTheme.colors.surface,
          borderRadius: designTheme.radius.lg,
          padding: { xs: 3, md: 5 },
          boxShadow: designTheme.shadows.lg,
        }}
      >
        {/* Loading Bar */}
        {isLoading && (
          <LinearProgress
            sx={{
              mb: 3,
              borderRadius: '4px',
              '& .MuiLinearProgress-bar': {
                backgroundColor: brandColors.navyBlue,
              },
            }}
          />
        )}

        {/* Heading */}
        <Box sx={{ mb: 4 }}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              color: designTheme.colors.textPrimary,
              mb: 1,
              lineHeight: 1.2,
            }}
          >
            Welcome Back
          </Typography>
          <Typography
            variant="body1"
            sx={{
              color: designTheme.colors.textSecondary,
              lineHeight: 1.5,
            }}
          >
            Sign in to continue to your dashboard
          </Typography>
        </Box>

        {/* Error Message */}
        {error && (
          <Alert
            severity="error"
            onClose={() => setError('')}
            sx={{ mb: 3, borderRadius: designTheme.radius.sm }}
          >
            {error}
          </Alert>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)}>
          <TextField
            {...register('email')}
            label="Email Address"
            type="email"
            fullWidth
            margin="normal"
            error={!!errors.email}
            helperText={errors.email?.message}
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
            sx={{
              mb: 2,
              '& .MuiOutlinedInput-root': {
                borderRadius: designTheme.radius.sm,
                '&:hover fieldset': {
                  borderColor: brandColors.navyBlue,
                },
                '&.Mui-focused fieldset': {
                  borderColor: brandColors.navyBlue,
                },
              },
              '& .MuiInputLabel-root.Mui-focused': {
                color: brandColors.navyBlue,
              },
            }}
          />

          <TextField
            {...register('password')}
            label="Password"
            type={showPassword ? 'text' : 'password'}
            fullWidth
            margin="normal"
            error={!!errors.password}
            helperText={errors.password?.message}
            autoComplete="current-password"
            placeholder="Enter your password"
            sx={{
              mb: 3,
              '& .MuiOutlinedInput-root': {
                borderRadius: designTheme.radius.sm,
                '&:hover fieldset': {
                  borderColor: brandColors.navyBlue,
                },
                '&.Mui-focused fieldset': {
                  borderColor: brandColors.navyBlue,
                },
              },
              '& .MuiInputLabel-root.Mui-focused': {
                color: brandColors.navyBlue,
              },
            }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword(!showPassword)}
                    edge="end"
                    size="small"
                  >
                    {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <Button
            type="submit"
            variant="contained"
            fullWidth
            size="large"
            disabled={isLoading}
            sx={{
              py: 1.5,
              borderRadius: designTheme.radius.md,
              backgroundColor: brandColors.navyBlue,
              fontWeight: 600,
              fontSize: '1rem',
              textTransform: 'none',
              boxShadow: 'none',
              '&:hover': {
                backgroundColor: brandColors.navyBlueDark,
                boxShadow: designTheme.shadows.button,
              },
              '&:disabled': {
                backgroundColor: designTheme.colors.border,
              },
            }}
          >
            {isLoading ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              'Sign In'
            )}
          </Button>
        </form>
      </Paper>

      {/* Footer */}
      <Box sx={{ mt: 6, textAlign: 'center' }}>
        <Typography
          variant="body2"
          sx={{ color: designTheme.colors.textTertiary }}
        >
          Contact admin if you forgot your password
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: designTheme.colors.textTertiary,
            display: 'block',
            mt: 2,
          }}
        >
          © 2025 CRM Lead Management System. All rights reserved.
        </Typography>
      </Box>
    </Box>
  );
}
