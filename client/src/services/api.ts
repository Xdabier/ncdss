import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_ROUTES } from '@ncdss/shared';
import { getServerUrl } from './config';
import { useAuthStore } from '../stores/auth.store';

let apiInstance: AxiosInstance | null = null;
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

/**
 * Silently refresh the access token using the stored refresh token.
 * Can be called proactively (before expiry) or reactively (after 401).
 * Does NOT touch isLocked or trigger navigation.
 * Returns the new access token, or null if refresh failed.
 */
export async function silentRefresh(): Promise<string | null> {
  try {
    const api = await getApi();
    const refreshToken = await useAuthStore.getState().getRefreshToken();
    if (!refreshToken) return null;

    const response = await api.post(API_ROUTES.auth.refresh, { refreshToken });
    const { accessToken, user } = response.data;

    // Update access token
    await useAuthStore.getState().setAccessToken(accessToken);
    setAuthToken(accessToken);

    // Update user data (e.g. hasPin, profileCompleted) without resetting lock state
    if (user) {
      await useAuthStore.getState().updateUser(user);
    }

    return accessToken;
  } catch {
    return null;
  }
}

export async function getApi(): Promise<AxiosInstance> {
  if (apiInstance) return apiInstance;

  const serverUrl = await getServerUrl();
  if (!serverUrl) throw new Error('Server URL not configured');

  apiInstance = axios.create({
    baseURL: `http://${serverUrl}/api`,
    timeout: 10000,
  });

  // Request interceptor to add auth token
  apiInstance.interceptors.request.use(
    async (config) => {
      const token = await useAuthStore.getState().getAccessToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Response interceptor to handle token refresh
  apiInstance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

      // If error is 401 and we haven't retried yet
      if (error.response?.status === 401 && !originalRequest._retry) {
        // Skip refresh for login and refresh endpoints
        if (
          originalRequest.url?.includes(API_ROUTES.auth.login) ||
          originalRequest.url?.includes(API_ROUTES.auth.refresh)
        ) {
          return Promise.reject(error);
        }

        if (isRefreshing) {
          // Wait for the token to be refreshed
          return new Promise((resolve, reject) => {
            subscribeTokenRefresh((token: string) => {
              if (!token) {
                reject(error);
                return;
              }
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(apiInstance!.request(originalRequest));
            });
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const refreshToken = await useAuthStore.getState().getRefreshToken();

          if (!refreshToken) {
            throw new Error('No refresh token available');
          }

          // Call refresh endpoint
          if (!apiInstance) throw new Error('API instance not initialized');
          const response = await apiInstance.post(API_ROUTES.auth.refresh, { refreshToken });
          const { accessToken, user } = response.data;

          // Update access token without touching lock state
          await useAuthStore.getState().setAccessToken(accessToken);
          setAuthToken(accessToken);

          // Update user data only (not lock state, not full setAuth)
          if (user) {
            await useAuthStore.getState().updateUser(user);
          }

          // Notify all subscribers
          onTokenRefreshed(accessToken);
          isRefreshing = false;

          // Retry original request with new token
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return apiInstance.request(originalRequest);
        } catch (refreshError) {
          isRefreshing = false;
          refreshSubscribers = [];

          // Clear auth - this will redirect via ProtectedRoute/LockScreen guards
          await useAuthStore.getState().clearAuth();

          return Promise.reject(refreshError);
        }
      }

      return Promise.reject(error);
    }
  );

  return apiInstance;
}

export function setAuthToken(token: string) {
  if (apiInstance) {
    apiInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }
}

export function clearApi() {
  apiInstance = null;
}
