import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_ROUTES } from '@ncdss/shared';
import { getServerUrl } from './config';
import { useAuthStore } from '../stores/auth.store';
import { CLIENT_ROUTES } from '../routes';

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
        // Skip refresh for login, refresh, and PIN verification endpoints
        if (
          originalRequest.url?.includes(API_ROUTES.auth.login) ||
          originalRequest.url?.includes(API_ROUTES.auth.refresh) ||
          originalRequest.url?.includes(API_ROUTES.profile.verifyPin)
        ) {
          return Promise.reject(error);
        }

        if (isRefreshing) {
          // Wait for the token to be refreshed
          return new Promise((resolve) => {
            subscribeTokenRefresh((token: string) => {
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
          const { accessToken, user, todayAssignment, todayShiftInfo } = response.data;

          // Update tokens in store
          await useAuthStore.getState().setAccessToken(accessToken);
          setAuthToken(accessToken);

          // Update user and assignment if provided
          if (user) {
            const currentRefreshToken = await useAuthStore.getState().getRefreshToken();
            if (currentRefreshToken) {
              await useAuthStore
                .getState()
                .setAuth(user, accessToken, currentRefreshToken, todayAssignment, todayShiftInfo);
            }
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

          // Clear auth and redirect to login
          await useAuthStore.getState().clearAuth();
          window.location.href = CLIENT_ROUTES.login;

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
