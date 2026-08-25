import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../types';
import api from '../services/api';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sandbox: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  setUser: (user: User) => void;
  setToken: (token: string, sandbox: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      sandbox: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { data } = await api.post('/auth/login', { email, password });
          localStorage.setItem('pos_token', data.token);
          set({
            user: data.user,
            token: data.token,
            isAuthenticated: true,
            isLoading: false,
            sandbox: false,
          });
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      logout: () => {
        localStorage.removeItem('pos_token');
        set({ user: null, token: null, isAuthenticated: false, sandbox: false });
      },

      hasPermission: (permission: string) => {
        const { user } = get();
        if (!user) return false;
        if (user.role_name === 'admin') return true;
        const perms = user.permissions;
        const keys = permission.split('.');
        let current: unknown = perms;
        for (const key of keys) {
          if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
            current = (current as Record<string, unknown>)[key];
          } else return false;
        }
        return Boolean(current);
      },

      setUser: (user) => set({ user }),

      setToken: (token, sandbox) => {
        localStorage.setItem('pos_token', token);
        set({ token, sandbox });
      },
    }),
    {
      name: 'pos_auth',
      partialize: (state) => ({ user: state.user, token: state.token, isAuthenticated: state.isAuthenticated, sandbox: state.sandbox }),
    }
  )
);
