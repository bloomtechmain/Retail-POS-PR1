import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/shared/ProtectedRoute';
import { ToastContainer } from './components/ui/Toast';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import GRN from './pages/GRN';
import Promotions from './pages/Promotions';
import Reports from './pages/Reports';
import Shifts from './pages/Shifts';
import Users from './pages/Users';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Protected — All Roles */}
        <Route element={<ProtectedRoute />}>
          <Route path="/pos" element={<POS />} />
          <Route path="/shifts" element={<Shifts />} />
        </Route>

        {/* Protected — Admin & Manager */}
        <Route element={<ProtectedRoute roles={['admin', 'manager']} />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/products" element={<Products />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/grn" element={<GRN />} />
          <Route path="/promotions" element={<Promotions />} />
          <Route path="/reports" element={<Reports />} />
        </Route>

        {/* Protected — Admin only */}
        <Route element={<ProtectedRoute roles={['admin']} />}>
          <Route path="/users" element={<Users />} />
        </Route>

        {/* Default redirects */}
        <Route path="/" element={<Navigate to="/pos" replace />} />
        <Route path="*" element={<Navigate to="/pos" replace />} />
      </Routes>

      <ToastContainer />
    </BrowserRouter>
  );
}
