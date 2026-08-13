import { voiceService } from "@/services/voice.service";

// Shared language catalog for every speech/translation selector (Chat reply +
// dictation languages, Voice Studio speech + reply languages). Loaded from the
// backend (/voice/languages) so all pickers stay in sync with the real catalog.
export interface LanguageOption {
  code: string;
  name: string;
  bcp47: string;
}

// Fetch the real catalog from the backend; empty list on failure (callers fall
// back to their English default).
export async function loadLanguages(): Promise<LanguageOption[]> {
  try {
    const list = await voiceService.getLanguages();
    if (Array.isArray(list) && list.length) return list;
  } catch { /* backend unavailable — English only */ }
  return [];
}

// Read a saved language code for a preference key, falling back when missing
// or (with a catalog) when the saved code is no longer offered. Raw reads for
// useState initializers happen before the catalog loads — pass no catalog then.
export function readSavedLanguage(key: string, fallback: string, catalog?: LanguageOption[]): string {
  try {
    const saved = localStorage.getItem(key);
    if (saved && (!catalog || catalog.some((l) => l.code === saved))) return saved;
  } catch { /* storage unavailable */ }
  return fallback;
}

// Persist a language choice (per browser — the same keys work everywhere).
export function saveLanguage(key: string, code: string): void {
  try { localStorage.setItem(key, code); } catch { /* ignore */ }
}

// Display name for a language code (falls back to the code itself).
export function languageName(catalog: LanguageOption[], code: string): string {
  return catalog.find((l) => l.code === code)?.name || code;
}
