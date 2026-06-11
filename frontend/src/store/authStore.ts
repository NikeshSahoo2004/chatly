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
      const accessToken = response.data.data.accessToken;
      const refreshToken = response.data.data.refreshToken;

      if (accessToken) {
        localStorage.setItem('accessToken', accessToken);
      }
      if (refreshToken) {
        localStorage.setItem('refreshToken', refreshToken);
      }

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
      // Register the user
      await api.post('/auth/register', details);
      
      // Automatically log them in to fetch access and refresh tokens
      const loginResponse = await api.post('/auth/login', {
        username: details.username,
        email: details.email,
        password: details.password,
      });

      const user = loginResponse.data.data.user;
      const accessToken = loginResponse.data.data.accessToken;
      const refreshToken = loginResponse.data.data.refreshToken;

      if (accessToken) {
        localStorage.setItem('accessToken', accessToken);
      }
      if (refreshToken) {
        localStorage.setItem('refreshToken', refreshToken);
      }

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
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    set({ user: null, isAuthenticated: false, error: null });
  },

  checkAuth: async () => {
    set({ isLoading: true, error: null });
    try {
      // Check if we have an access token locally
      const token = localStorage.getItem('accessToken');
      if (!token) {
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      const response = await api.get('/auth/me');
      const user = response.data.data.user;
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (err) {
      // Session is inactive, reset values silently without throwing errors on boot check
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
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
