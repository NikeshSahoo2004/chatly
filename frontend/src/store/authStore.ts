import { create } from 'zustand';
import { api } from '../services/api';

export interface User {
  id: string;
  _id: string;
  name: string;
  username: string;
  email: string;
  avatar: string;
  role: string;
  isOnline: boolean;
  lastSeen?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (credentials: Record<string, string>) => Promise<void>;
  register: (details: Record<string, string>) => Promise<void>;
  logout: (localOnly?: boolean) => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  clearError: () => set({ error: null }),

  login: async (credentials) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post('/auth/login', credentials);
      const user = response.data.data.user;
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      const message = err.response?.data?.message || 'Login failed';
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  register: async (details) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post('/auth/register', details);
      const user = response.data.data.user;
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      const message = err.response?.data?.message || 'Registration failed';
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  logout: async (localOnly = false) => {
    if (!localOnly) {
      try {
        await api.post('/auth/logout');
      } catch (err) {
        // Ignore API failures during logout, clear local state anyway
      }
    }
    set({ user: null, isAuthenticated: false, error: null });
  },

  checkAuth: async () => {
    set({ isLoading: true, error: null });
    try {
      // Endpoint to fetch current user profile using active session cookies
      // We will map this to GET /api/auth/me or similar, let's make sure it checks session
      // Wait, in our auth controller did we define a getMe endpoint?
      // Let's check auth.routes.ts to see if we have getMe or profile endpoint.
      // If we don't, we can add GET /api/auth/me or verify how we check session.
      // Let's check auth.routes.ts.
      const response = await api.get('/auth/me');
      const user = response.data.data.user;
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (err) {
      // Session is inactive, reset values silently without throwing errors on boot check
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));

// Bind custom Axios unauthorized event to clean up Zustand store states
if (typeof window !== 'undefined') {
  window.addEventListener('auth:unauthorized', () => {
    useAuthStore.getState().logout(true);
  });
}
