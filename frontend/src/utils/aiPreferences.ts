/**
 * AI preferences persisted in localStorage (the backend has no settings table,
 * so defaults live client-side — they only influence which model the pickers
 * preselect; every request still goes through the existing backend APIs).
 */
export interface AIPreferences {
  /** Default chat model id, or "auto" for the backend's auto/best-for-task. */
  defaultModel: string;
}

const KEY = "nexusai-ai-preferences";

export function getAIPreferences(): AIPreferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.defaultModel === "string") {
        return { defaultModel: parsed.defaultModel || "auto" };
      }
    }
  } catch {
    /* fall through to defaults */
  }
  return { defaultModel: "auto" };
}

export function setAIPreferences(prefs: AIPreferences): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable — ignore */
  }
}

/** Default chat model the pickers should preselect ("auto" if unset). */
export function getDefaultChatModel(): string {
  return getAIPreferences().defaultModel || "auto";
}
