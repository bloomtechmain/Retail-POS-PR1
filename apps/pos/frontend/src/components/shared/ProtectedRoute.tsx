import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { FeatureKey } from '../../types';
import { Layout } from '../layout/Layout';

interface Props {
  roles?: string[];
  feature?: FeatureKey;
  noLayout?: boolean;
}

export function ProtectedRoute({ roles, feature, noLayout }: Props) {
  const { isAuthenticated, user } = useAuthStore();
  const { settings, hasFeature } = useSettingsStore();
  const location = useLocation();

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (roles && user && !roles.includes(user.role_name)) {
    return <Navigate to="/pos" replace />;
  }

  // Business-wide plan gate — separate from the per-user role check above.
  // Skipped during first-run setup itself (nothing has a plan chosen yet).
  if (feature && settings && !hasFeature(feature) && location.pathname !== '/setup') {
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
