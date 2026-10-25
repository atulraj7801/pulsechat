import { create } from 'zustand';
export const useUI = create((set) => ({
  theme: localStorage.getItem('pulse-theme') || 'light',
  sidebarOpen: false,
  detailsOpen: false,
  toggleTheme: () =>
    set((s) => {
      const theme = s.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('pulse-theme', theme);
      return { theme };
    }),
  setSidebar: (sidebarOpen) => set({ sidebarOpen }),
  toggleDetails: () => set((s) => ({ detailsOpen: !s.detailsOpen })),
}));
