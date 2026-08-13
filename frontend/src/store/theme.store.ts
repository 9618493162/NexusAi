import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useAuthStore } from "@/store/auth.store";
import { authService } from "@/services/auth.service";

export type ThemeMode = "light" | "dark" | "system";

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
}

export function resolveDark(mode: ThemeMode): boolean {
  return mode === "dark" || (mode === "system" && systemPrefersDark());
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * Persist the chosen theme to the account (PATCH /auth/me) so it follows the
 * user across devices. Skipped when signed out — the local value still applies.
 */
function persistThemeToServer(mode: ThemeMode): void {
  if (!useAuthStore.getState().accessToken) return;
  authService.updateProfile({ theme: mode }).catch(() => { /* keep local; retried on next change */ });
}

interface ThemeState {
  /** User's chosen mode. */
  mode: ThemeMode;
  /** Resolved dark flag (existing consumers use this). */
  isDark: boolean;
  /** User action — applies locally AND persists to the account. */
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
  setDark: (value: boolean) => void;
  /** Server-originated application (boot sync, OS change) — no push back. */
  applyServerTheme: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: "dark",
      isDark: true,
      setMode: (mode) => {
        set({ mode, isDark: resolveDark(mode) });
        persistThemeToServer(mode);
      },
      toggle: () =>
        set((state) => {
          const isDark = !state.isDark;
          const mode: ThemeMode = isDark ? "dark" : "light";
          persistThemeToServer(mode);
          return { isDark, mode };
        }),
      setDark: (value) => {
        const mode: ThemeMode = value ? "dark" : "light";
        set({ isDark: value, mode });
        persistThemeToServer(mode);
      },
      applyServerTheme: (mode) => set({ mode, isDark: resolveDark(mode) }),
    }),
    {
      name: "nexusai-theme",
      // Migrate the legacy boolean-only shape ({ isDark }) to the new mode field.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ThemeState>;
        if (isThemeMode(p.mode)) {
          return { ...current, ...p, isDark: resolveDark(p.mode) };
        }
        const isDark = typeof p.isDark === "boolean" ? p.isDark : true;
        return { ...current, isDark, mode: isDark ? "dark" : "light" };
      },
    }
  )
);

/**
 * Pull the account's saved theme from the backend and apply it (the server is
 * the source of truth; localStorage is only a cache for offline/startup).
 * Call once after the app boots while signed in.
 */
export async function syncThemeFromServer(): Promise<void> {
  if (!useAuthStore.getState().accessToken) return;
  try {
    const { data } = await authService.me();
    const serverTheme = data?.theme;
    if (!isThemeMode(serverTheme)) return;
    const local = useThemeStore.getState().mode;

    // Migration: pre-existing accounts have the schema default ("system") in
    // the DB even when the user had chosen light/dark locally. In that case
    // keep the real local choice and push it up once, so the server becomes
    // the source of truth without clobbering the user's preference.
    if (serverTheme === "system" && local !== "system") {
      persistThemeToServer(local);
      return;
    }

    if (serverTheme !== local) {
      useThemeStore.getState().applyServerTheme(serverTheme);
    }
  } catch {
    /* offline/unauthenticated — keep the local preference */
  }
}
