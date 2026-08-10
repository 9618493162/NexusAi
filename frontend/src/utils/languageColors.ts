// Per-language badge colors for quick visual scanning in chat. Users can pick
// a color per language (Settings > Language colors); anything unpicked uses a
// stable default derived from the language code, so colors stay consistent
// across sessions without any configuration. Picks are synced to the backend
// so they follow the user across devices.

import { api } from "@/services/api";

const STORAGE_KEY = "nexusai-lang-colors";

export const LANG_COLORS = [
  "#f97316", // orange
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#0ea5e9", // sky
  "#ef4444", // red
  "#eab308", // yellow
  "#ec4899", // pink
  "#14b8a6", // teal
  "#6366f1", // indigo
  "#84cc16", // lime
  "#f43f5e", // rose
  "#06b6d4", // cyan
];

// Stable hash of the language code -> palette index (same color every time).
export function defaultColorFor(code: string): string {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  }
  return LANG_COLORS[hash % LANG_COLORS.length];
}

function savedColors(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getLangColor(code: string): string {
  const saved = savedColors()[code];
  if (saved && LANG_COLORS.includes(saved)) return saved;
  return defaultColorFor(code);
}

export function setLangColor(code: string, color: string): void {
  try {
    const all = savedColors();
    all[code] = color;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

export function resetLangColor(code: string): void {
  try {
    const all = savedColors();
    delete all[code];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

// Pull the user's colors from the backend (e.g. set on another device) and
// merge them into local storage — server values win. Safe to call on mount.
export async function syncLangColorsFromServer(): Promise<void> {
  try {
    const { data } = await api.get("/settings/language-colors");
    if (data && typeof data === "object") {
      const all = savedColors();
      Object.entries(data).forEach(([lang, color]) => {
        if (typeof color === "string" && LANG_COLORS.includes(color as (typeof LANG_COLORS)[number])) {
          all[lang] = color;
        }
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    }
  } catch { /* offline / not signed in — keep local */ }
}

// Push the user's current colors to the backend so other devices pick them up.
export async function pushLangColorsToServer(): Promise<void> {
  try {
    await api.put("/settings/language-colors", { colors: savedColors() });
  } catch { /* best-effort sync */ }
}
