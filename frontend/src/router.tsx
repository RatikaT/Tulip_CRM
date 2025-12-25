import { createBrowserRouter, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LeadsPage from './pages/LeadsPage';
import LeadDetailPage from './pages/LeadDetailPage';
import UsersPage from './pages/UsersPage';
import SettingsPage from './pages/SettingsPage';
import SummariesPage from './pages/SummariesPage';
import BulkUploadPage from './pages/BulkUploadPage';
import KnowledgeBasePage from './pages/KnowledgeBasePage';
import CRMHomePage from './pages/CRMHomePage';
import ComingSoonPage from './pages/ComingSoonPage';

// Protected route wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// Admin-only route wrapper (includes super_admin)
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role !== 'admin' && user?.role !== 'super_admin') {
    return <Navigate to="/tulip/dashboard" replace />;
  }

  return <>{children}</>;
};

// CRM access route wrapper
const CRMRoute = ({ crmId, children }: { crmId: string; children: React.ReactNode }) => {
  const { isAuthenticated, hasAccessToCRM } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!hasAccessToCRM(crmId)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <CRMHomePage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/tulip',
    element: (
      <ProtectedRoute>
        <CRMRoute crmId="tulip">
          <AppLayout />
        </CRMRoute>
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/tulip/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: <DashboardPage />,
      },
      {
        path: 'leads',
        element: <LeadsPage />,
      },
      {
        path: 'leads/:leadId',
        element: <LeadDetailPage />,
      },
      {
        path: 'bulk-upload',
        element: (
          <AdminRoute>
            <BulkUploadPage />
          </AdminRoute>
        ),
      },
      {
        path: 'users',
        element: (
          <AdminRoute>
            <UsersPage />
          </AdminRoute>
        ),
      },
      {
        path: 'summaries',
        element: <SummariesPage />,
      },
      {
        path: 'settings',
        element: (
          <AdminRoute>
            <SettingsPage />
          </AdminRoute>
        ),
      },
      {
        path: 'knowledge-base',
        element: <KnowledgeBasePage />,
      },
    ],
  },
  {
    path: '/health-compass',
    element: (
      <ProtectedRoute>
        <CRMRoute crmId="health_compass">
          <ComingSoonPage />
        </CRMRoute>
      </ProtectedRoute>
    ),
  },
  {
    path: '/health_compass',
    element: (
      <ProtectedRoute>
        <CRMRoute crmId="health_compass">
          <ComingSoonPage />
        </CRMRoute>
      </ProtectedRoute>
    ),
  },
  // Legacy route redirects (for backwards compatibility)
  {
    path: '/dashboard',
    element: <Navigate to="/tulip/dashboard" replace />,
  },
  {
    path: '/leads',
    element: <Navigate to="/tulip/leads" replace />,
  },
  {
    path: '/leads/:leadId',
    element: <Navigate to="/tulip/leads/:leadId" replace />,
  },
  {
    path: '/bulk-upload',
    element: <Navigate to="/tulip/bulk-upload" replace />,
  },
  {
    path: '/users',
    element: <Navigate to="/tulip/users" replace />,
  },
  {
    path: '/summaries',
    element: <Navigate to="/tulip/summaries" replace />,
  },
  {
    path: '/settings',
    element: <Navigate to="/tulip/settings" replace />,
  },
  {
    path: '/knowledge-base',
    element: <Navigate to="/tulip/knowledge-base" replace />,
  },
  // Catch-all 404 - redirect to home
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
