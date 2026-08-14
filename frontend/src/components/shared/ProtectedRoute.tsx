import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { Layout } from '../layout/Layout';

interface Props {
  roles?: string[];
  noLayout?: boolean;
}

export function ProtectedRoute({ roles, noLayout }: Props) {
  const { isAuthenticated, user } = useAuthStore();
  const { settings } = useSettingsStore();
  const location = useLocation();

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (roles && user && !roles.includes(user.role_name)) {
    return <Navigate to="/pos" replace />;
  }

  if (
    user?.role_name === 'admin' &&
    settings !== null &&
    settings.setup_completed === false &&
    location.pathname !== '/setup'
  ) {
    return <Navigate to="/setup" replace />;
  }

  if (noLayout) {
    return <Outlet />;
  }

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}
