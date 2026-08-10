import axios from "axios";
import { useAuthStore } from "@/store/auth.store";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];
// Dedupes concurrent refresh calls (axios interceptor + chat streaming share one).
let refreshPromise: Promise<string> | null = null;

async function doRefresh(): Promise<string> {
  const refreshTokenValue = useAuthStore.getState().refreshToken;
  if (!refreshTokenValue) throw new Error("No refresh token available");
  const { data } = await axios.post(`${API_URL}/api/auth/refresh`, {
    refreshToken: refreshTokenValue,
  });
  useAuthStore.getState().setAuth(
    useAuthStore.getState().user!,
    data.accessToken,
    data.refreshToken
  );
  return data.accessToken;
}

// Shared by the axios interceptor and raw-fetch calls (chat streaming).
export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      if (isRefreshing) {
        return new Promise((resolve) => {
          refreshSubscribers.push((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          });
        });
      }
      isRefreshing = true;
      try {
        const token = await refreshAccessToken();
        refreshSubscribers.forEach((cb) => cb(token));
        refreshSubscribers = [];
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      } catch (refreshError) {
        useAuthStore.getState().logout();
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);
