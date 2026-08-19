import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CreateCustomer from './pages/CreateCustomer';
import MyCustomers from './pages/MyCustomers';
import CustomerDetail from './pages/CustomerDetail';
import Agents from './pages/Agents';

function ProtectedRoutes() {
  const { staff } = useAuth();
  if (!staff) return <Navigate to="/login" replace />;
  return <Layout />;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { staff } = useAuth();
  if (staff?.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoutes />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/create-customer" element={<CreateCustomer />} />
        <Route path="/customers" element={<MyCustomers />} />
        <Route path="/customers/:id" element={<CustomerDetail />} />
        <Route path="/agents" element={<AdminOnly><Agents /></AdminOnly>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
