import { api } from "./api";
import { useAuthStore } from "@/store/auth.store";

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
  updateProfile: (data: {
    name?: string;
    avatar?: string | null;
    theme?: "light" | "dark" | "system";
    dictateLang?: string | null;
    dictateTo?: string | null;
  }) => api.patch("/auth/me", data),
  uploadAvatar: (file: File) => {
    const fd = new FormData();
    fd.append("avatar", file);
    return api.post("/auth/avatar", fd, { headers: { "Content-Type": "multipart/form-data" } });
  },
  removeAvatar: () => api.delete("/auth/avatar"),
  refresh: (refreshToken: string) => api.post("/auth/refresh", { refreshToken }),
  logout: (refreshToken: string) => api.post("/auth/logout", { refreshToken }),
  logoutAll: () => api.post("/auth/logout-all"),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post("/auth/change-password", { currentPassword, newPassword }),
  getSessions: () => {
    const rt = useAuthStore.getState().refreshToken;
    return api.get("/auth/sessions", { headers: rt ? { "x-refresh-token": rt } : {} });
  },
  revokeSession: (id: string) => {
    const rt = useAuthStore.getState().refreshToken;
    return api.delete(`/auth/sessions/${id}`, { headers: rt ? { "x-refresh-token": rt } : {} });
  },
  requestPasswordReset: (email: string) => api.post("/auth/request-password-reset", { email }),
  resetPassword: (token: string, password: string) =>
    api.post("/auth/reset-password", { token, password }),
};
