import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { Layout } from '../layout/Layout';

interface Props {
  roles?: string[];
}

export function ProtectedRoute({ roles }: Props) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (roles && user && !roles.includes(user.role_name)) {
    return <Navigate to="/pos" replace />;
  }

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}
