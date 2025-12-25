import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Grid,
  Box,
  Typography,
  IconButton,
  Divider,
  CircularProgress,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  Chip,
  OutlinedInput,
  FormHelperText,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { CRM_TYPES } from '../../types/crm.types';

const createUserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
  full_name: z.string().min(1, 'Full name is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['super_admin', 'admin', 'agent'], { required_error: 'Role is required' }),
  is_active: z.boolean(),
  crm_types: z.array(z.string()).min(1, 'At least one CRM type is required'),
});

type CreateUserFormData = z.infer<typeof createUserSchema>;

interface UserCreateModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function UserCreateModal({ open, onClose, onSuccess }: UserCreateModalProps) {
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      role: 'agent',
      is_active: true,
      crm_types: ['tulip'],
    },
  });

  const handleClose = () => {
    reset();
    onClose();
  };

  const onSubmit = async (data: CreateUserFormData) => {
    setSaving(true);
    try {
      await api.post('/users', data);
      handleClose();
      onSuccess();
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to create user';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Create New User
          </Typography>
          <IconButton onClick={handleClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <Divider />

      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                {...register('full_name')}
                fullWidth
                label="Full Name *"
                error={!!errors.full_name}
                helperText={errors.full_name?.message}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                {...register('username')}
                fullWidth
                label="Username *"
                error={!!errors.username}
                helperText={errors.username?.message}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                {...register('email')}
                fullWidth
                label="Email *"
                type="email"
                error={!!errors.email}
                helperText={errors.email?.message}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                {...register('password')}
                fullWidth
                label="Password *"
                type={showPassword ? 'text' : 'password'}
                error={!!errors.password}
                helperText={errors.password?.message}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                        size="small"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <Controller
                name="role"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    select
                    label="Role *"
                    error={!!errors.role}
                    helperText={errors.role?.message}
                  >
                    <MenuItem value="agent">Agent</MenuItem>
                    <MenuItem value="admin">Admin</MenuItem>
                    <MenuItem value="super_admin">Super Admin</MenuItem>
                  </TextField>
                )}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <Controller
                name="is_active"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    value={field.value ? 'true' : 'false'}
                    onChange={(e) => field.onChange(e.target.value === 'true')}
                    fullWidth
                    select
                    label="Status"
                  >
                    <MenuItem value="true">Active</MenuItem>
                    <MenuItem value="false">Inactive</MenuItem>
                  </TextField>
                )}
              />
            </Grid>

            <Grid item xs={12}>
              <Controller
                name="crm_types"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth error={!!errors.crm_types}>
                    <InputLabel>CRM Access *</InputLabel>
                    <Select
                      {...field}
                      multiple
                      input={<OutlinedInput label="CRM Access *" />}
                      renderValue={(selected) => (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {selected.map((value) => {
                            const crm = CRM_TYPES.find((c) => c.id === value);
                            return <Chip key={value} label={crm?.name || value} size="small" />;
                          })}
                        </Box>
                      )}
                    >
                      {CRM_TYPES.map((crm) => (
                        <MenuItem key={crm.id} value={crm.id}>
                          {crm.name}
                        </MenuItem>
                      ))}
                    </Select>
                    {errors.crm_types && (
                      <FormHelperText>{errors.crm_types.message}</FormHelperText>
                    )}
                  </FormControl>
                )}
              />
            </Grid>
          </Grid>
        </DialogContent>

        <Divider />

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving}>
            {saving ? <CircularProgress size={24} /> : 'Create User'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
