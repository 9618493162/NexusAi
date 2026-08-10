import { api } from "./api";

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials extends LoginCredentials {
  name?: string;
}

export const authService = {
  login: (credentials: LoginCredentials) => api.post("/auth/login", credentials),
  register: (credentials: RegisterCredentials) => api.post("/auth/register", credentials),
  supabaseSession: (accessToken: string) => api.post("/auth/supabase/session", { accessToken }),
  me: () => api.get("/auth/me"),
  refresh: (refreshToken: string) => api.post("/auth/refresh", { refreshToken }),
  logout: (refreshToken: string) => api.post("/auth/logout", { refreshToken }),
  requestPasswordReset: (email: string) => api.post("/auth/request-password-reset", { email }),
  resetPassword: (token: string, password: string) =>
    api.post("/auth/reset-password", { token, password }),
};
