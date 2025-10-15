import { create } from 'zustand';

// UI state interface
interface UIState {
  isLoading: boolean;
  theme: 'light' | 'dark';
  sidebarOpen: boolean;
  setLoading: (loading: boolean) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleSidebar: () => void;
}

// Zustand store for UI state
export const useUIStore = create<UIState>((set) => ({
  isLoading: false,
  theme: 'light',
  sidebarOpen: false,

  setLoading: (loading) => set({ isLoading: loading }),

  setTheme: (theme) => set({ theme }),

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));
