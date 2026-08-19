import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/shared/ProtectedRoute';
import { ToastContainer } from './components/ui/Toast';
import { useSettingsStore } from './store/settingsStore';
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
import Customers from './pages/Customers';
import Setup from './pages/Setup';
import SettingsPage from './pages/Settings';
import VatInvoice from './pages/VatInvoice';

export default function App() {
  useEffect(() => {
    useSettingsStore.getState().fetchSettings();
    useSettingsStore.getState().fetchPlans();
  }, []);

  // Chrome/Edge change a focused <input type="number">'s value when the
  // mouse wheel scrolls over it (even just scrolling the page past it) —
  // silently nudging amounts like cash tendered by a step or two with no
  // visual cue. preventDefault blocks the value change outright (must be a
  // non-passive listener for that to have any effect); blur is a backup so
  // a stray tick can't nudge it again before the user notices.
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement && el.type === 'number' && el === e.target) {
        e.preventDefault();
        el.blur();
      }
    };
    document.addEventListener('wheel', handler, { passive: false });
    return () => document.removeEventListener('wheel', handler);
  }, []);

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
        <Route element={<ProtectedRoute feature="vat_invoice" />}>
          <Route path="/vat-invoice" element={<VatInvoice />} />
        </Route>

        {/* Protected — Admin & Manager, always-available pages (Basic tier and up) */}
        <Route element={<ProtectedRoute roles={['admin', 'manager']} />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/products" element={<Products />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/grn" element={<GRN />} />
        </Route>

        {/* Protected — Admin & Manager, plan-gated pages */}
        <Route element={<ProtectedRoute roles={['admin', 'manager']} feature="promotions" />}>
          <Route path="/promotions" element={<Promotions />} />
        </Route>
        <Route element={<ProtectedRoute roles={['admin', 'manager']} feature="reports" />}>
          <Route path="/reports" element={<Reports />} />
        </Route>
        <Route element={<ProtectedRoute roles={['admin', 'manager']} feature="customers" />}>
          <Route path="/customers" element={<Customers />} />
        </Route>

        {/* Protected — Admin only */}
        <Route element={<ProtectedRoute roles={['admin']} feature="users" />}>
          <Route path="/users" element={<Users />} />
        </Route>
        <Route element={<ProtectedRoute roles={['admin']} />}>
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* Protected — Admin only, no sidebar/nav chrome (first-run setup) */}
        <Route element={<ProtectedRoute roles={['admin']} noLayout />}>
          <Route path="/setup" element={<Setup />} />
        </Route>

        {/* Default redirects */}
        <Route path="/" element={<Navigate to="/pos" replace />} />
        <Route path="*" element={<Navigate to="/pos" replace />} />
      </Routes>

      <ToastContainer />
    </BrowserRouter>
  );
}
