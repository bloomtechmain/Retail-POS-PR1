import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Lang = 'en' | 'si';

interface LanguageStore {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggleLang: () => void;
}

export const useLanguageStore = create<LanguageStore>()(
  persist(
    (set, get) => ({
      lang: 'en',
      setLang: (lang) => set({ lang }),
      toggleLang: () => set({ lang: get().lang === 'en' ? 'si' : 'en' }),
    }),
    { name: 'pos_lang' }
  )
);
