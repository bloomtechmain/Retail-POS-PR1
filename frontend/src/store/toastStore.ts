import { create } from 'zustand';
import { Toast, ToastType } from '../types';

interface ToastStore {
  toasts: Toast[];
  add: (type: ToastType, message: string, duration?: number) => void;
  remove: (id: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  add: (type, message, duration = 3500) => {
    const id = Math.random().toString(36).slice(2);
    set((state) => ({ toasts: [...state.toasts, { id, type, message, duration }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },

  remove: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },

  success: (message) => useToastStore.getState().add('success', message),
  error: (message) => useToastStore.getState().add('error', message),
  warning: (message) => useToastStore.getState().add('warning', message),
  info: (message) => useToastStore.getState().add('info', message),
}));
