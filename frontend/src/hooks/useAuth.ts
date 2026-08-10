import { useEffect } from "react";
import { useAuthStore } from "@/store/auth.store";
import { authService } from "@/services/auth.service";

export function useAuth() {
  const { user, isAuthenticated, setAuth, logout } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated && !user) {
      authService.me()
        .then(({ data }) => {
          setAuth(data, useAuthStore.getState().accessToken!, useAuthStore.getState().refreshToken!);
        })
        .catch(() => logout());
    }
  }, [isAuthenticated, user, setAuth, logout]);

  return { user, isAuthenticated, logout };
}
