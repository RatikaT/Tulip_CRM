import { useState, useEffect } from 'react';
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
  FormControl,
  InputLabel,
  Select,
  Chip,
  OutlinedInput,
  FormHelperText,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { CRM_TYPES } from '../../types/crm.types';
import { User } from '../../types/user.types';

const editUserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
  full_name: z.string().min(1, 'Full name is required'),
  password: z.string().refine(
    (val) => val === '' || val.length >= 8,
    'Password must be at least 8 characters'
  ),
  role: z.enum(['super_admin', 'admin', 'agent'], { required_error: 'Role is required' }),
  is_active: z.boolean(),
  crm_types: z.array(z.string()).min(1, 'At least one CRM type is required'),
});

type EditUserFormData = z.infer<typeof editUserSchema>;

interface UserEditModalProps {
  open: boolean;
  user: User | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function UserEditModal({ open, user, onClose, onSuccess }: UserEditModalProps) {
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<EditUserFormData>({
    resolver: zodResolver(editUserSchema),
  });

  useEffect(() => {
    if (user && open) {
      reset({
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        password: '',
        role: user.role,
        is_active: user.is_active,
        crm_types: user.crm_types || ['tulip'],
      });
    }
  }, [user, open, reset]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const onSubmit = async (data: EditUserFormData) => {
    if (!user) return;

    setSaving(true);
    try {
      // Only include password if it's not empty
      const { password, ...restData } = data;
      const updateData = password ? { ...restData, password } : restData;
      console.log('Updating user:', user.id, 'with data:', updateData);
      await api.put(`/users/${user.id}`, updateData);
      handleClose();
      onSuccess();
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to update user';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Edit User
          </Typography>
          <IconButton onClick={handleClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <Divider />

      <form onSubmit={handleSubmit(onSubmit, (errors) => console.log('Form validation errors:', errors))}>
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
                label="New Password"
                type="password"
                error={!!errors.password}
                helperText={errors.password?.message || 'Leave blank to keep current password'}
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
            {saving ? <CircularProgress size={24} /> : 'Save Changes'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
