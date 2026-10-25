import { create } from 'zustand';
export const useAuth = create((set) => ({
  user: null,
  token: null,
  ready: false,
  setSession: (session) => set({ user: session.user, token: session.access_token, ready: true }),
  clear: () => set({ user: null, token: null, ready: true }),
  updateUser: (user) => set({ user }),
}));
