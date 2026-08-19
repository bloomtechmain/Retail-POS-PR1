import { create } from 'zustand';
import api from '../services/api';
import { Settings, Plan, FeatureKey } from '../types';

interface SettingsStore {
  settings: Settings | null;
  plans: Plan[];
  isLoading: boolean;
  fetchSettings: () => Promise<void>;
  fetchPlans: () => Promise<void>;
  setSettings: (s: Settings) => void;
  hasFeature: (feature: FeatureKey) => boolean;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: null,
  plans: [],
  isLoading: false,
  fetchSettings: async () => {
    set({ isLoading: true });
    try {
      const { data } = await api.get('/settings');
      set({ settings: data.data, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
  fetchPlans: async () => {
    try {
      const { data } = await api.get('/settings/plans');
      set({ plans: data.data });
    } catch { /* plan catalog is only needed for gating UI — fail quietly */ }
  },
  setSettings: (s) => set({ settings: s }),
  // Every plan's admin (role_name === 'admin') check is handled separately
  // by role-based ProtectedRoute — this only answers "does the business's
  // current subscription include this feature at all".
  hasFeature: (feature) => {
    const { settings, plans } = get();
    if (!settings) return false;
    const plan = plans.find((p) => p.key === settings.plan_key);
    return plan ? plan.features.includes(feature) : false;
  },
}));
