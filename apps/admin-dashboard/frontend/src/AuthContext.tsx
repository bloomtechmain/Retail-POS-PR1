import { createContext, useContext, useState, ReactNode } from 'react';
import { StaffUser } from './services/api';

interface AuthContextValue {
  staff: StaffUser | null;
  setAuth: (token: string, staff: StaffUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const loadStaff = (): StaffUser | null => {
  const raw = localStorage.getItem('staff_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StaffUser;
  } catch {
    return null;
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<StaffUser | null>(loadStaff());

  const setAuth = (token: string, staffUser: StaffUser) => {
    localStorage.setItem('staff_token', token);
    localStorage.setItem('staff_user', JSON.stringify(staffUser));
    setStaff(staffUser);
  };

  const logout = () => {
    localStorage.removeItem('staff_token');
    localStorage.removeItem('staff_user');
    setStaff(null);
  };

  return <AuthContext.Provider value={{ staff, setAuth, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
