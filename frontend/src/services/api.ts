import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

// API base URL - uses environment variable in production, proxy in development
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Don't redirect to login for auth endpoints (login itself returns 401 for invalid credentials)
    const isAuthEndpoint = error.config?.url?.includes('/auth/login');

    if (error.response?.status === 401 && !isAuthEndpoint) {
      // Token expired or invalid - only redirect for non-login requests
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
