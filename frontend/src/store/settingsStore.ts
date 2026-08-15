import { create } from 'zustand';
import api from '../services/api';
import { Settings } from '../types';

interface SettingsStore {
  settings: Settings | null;
  isLoading: boolean;
  fetchSettings: () => Promise<void>;
  setSettings: (s: Settings) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: null,
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
  setSettings: (s) => set({ settings: s }),
}));
