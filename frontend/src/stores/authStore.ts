import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../types/user.types';

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
  isSuperAdmin: () => boolean;
  isAdmin: () => boolean;
  hasAccessToCRM: (crmId: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,

      setAuth: (token: string, user: User) => {
        set({
          token,
          user,
          isAuthenticated: true,
        });
      },

      logout: () => {
        set({
          token: null,
          user: null,
          isAuthenticated: false,
        });
      },

      isSuperAdmin: () => {
        const { user } = get();
        return user?.role === 'super_admin';
      },

      isAdmin: () => {
        const { user } = get();
        return user?.role === 'admin' || user?.role === 'super_admin';
      },

      hasAccessToCRM: (crmId: string) => {
        const { user } = get();
        if (!user) return false;
        // Super admin has access to all CRMs
        if (user.role === 'super_admin') return true;
        // For backward compatibility: if user doesn't have crm_types yet,
        // allow access to 'tulip' for existing admin/agent users
        if (!user.crm_types || user.crm_types.length === 0) {
          return crmId === 'tulip';
        }
        // Check if user has the CRM in their crm_types array
        return user.crm_types.includes(crmId);
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
