const trimEnv = (value: string | undefined) => value?.trim();

const isProduction = import.meta.env.PROD;

const fallbackApiUrl = isProduction ? '/api' : 'http://localhost:5000/api';
const fallbackSocketUrl =
  isProduction && typeof window !== 'undefined'
    ? window.location.origin
    : 'http://localhost:5000';

export const API_BASE_URL = trimEnv(import.meta.env.VITE_API_URL) || fallbackApiUrl;
export const SOCKET_URL = trimEnv(import.meta.env.VITE_SOCKET_URL) || fallbackSocketUrl;

if (isProduction && !trimEnv(import.meta.env.VITE_API_URL)) {
  console.warn('[Chatly] VITE_API_URL is not set. Using the production fallback /api.');
}

if (isProduction && !trimEnv(import.meta.env.VITE_SOCKET_URL)) {
  console.warn('[Chatly] VITE_SOCKET_URL is not set. Using the production fallback origin.');
}