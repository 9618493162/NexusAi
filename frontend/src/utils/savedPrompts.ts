/**
 * Saved prompts — reusable prompt bookmarks kept per-user in localStorage.
 *
 * The backend has no saved-prompts table, so per the "prefer safe frontend
 * persistence before touching the database" rule these live client-side,
 * keyed by user id (the same pattern as onboarding interests). They're real
 * bookmarks with real persistence across refreshes; using one just prefills
 * the Chat composer — every request still goes through the existing APIs.
 */

export interface SavedPrompt {
  id: string;
  title: string;
  prompt: string;
  createdAt: number;
  updatedAt: number;
}

const KEY = "nexusai-saved-prompts";

type PromptMap = Record<string, SavedPrompt[]>;

function readAll(): PromptMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as PromptMap;
    }
  } catch {
    /* storage unavailable/corrupt — treat as empty */
  }
  return {};
}

function writeAll(map: PromptMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable — ignore */
  }
}

function listFor(userId: string, map: PromptMap): SavedPrompt[] {
  return Array.isArray(map[userId]) ? map[userId] : [];
}

function makeId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

/** This user's saved prompts, newest first. */
export function getSavedPrompts(userId: string): SavedPrompt[] {
  return listFor(userId, readAll()).sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Create or update a prompt. Auto-cleans duplicates: saving a prompt whose
 * text already exists updates that entry instead of adding a copy, and
 * editing never leaves two prompts with identical text behind (the just-
 * edited entry wins). Returns the new list for the user.
 */
export function savePrompt(userId: string, input: { id?: string; title: string; prompt: string }): SavedPrompt[] {
  const title = input.title.trim();
  const prompt = input.prompt.trim();
  if (!title || !prompt) return getSavedPrompts(userId);

  const map = readAll();
  const list = listFor(userId, map);
  const now = Date.now();

  if (input.id) {
    const idx = list.findIndex((p) => p.id === input.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], title, prompt, updatedAt: now };
    } else {
      list.push({ id: input.id, title, prompt, createdAt: now, updatedAt: now });
    }
  } else {
    // Saving without an id: if this exact text is already saved, update that
    // entry (title refresh) rather than piling up duplicates — re-saving the
    // same message from Chat or adding the same suggestion twice never stacks.
    const existing = list.find((p) => p.prompt.trim() === prompt);
    if (existing) {
      existing.title = title;
      existing.updatedAt = now;
      map[userId] = list;
      writeAll(map);
      return getSavedPrompts(userId);
    }
    list.push({ id: makeId(), title, prompt, createdAt: now, updatedAt: now });
  }

  // Auto-clean after an edit: drop any older copy whose text now matches the
  // edited entry. The edited one is processed FIRST so it always wins the
  // first-occurrence-wins pass (later duplicates are dropped).
  const ordered = [...list].sort((a, b) => (a.id === input.id ? -1 : b.id === input.id ? 1 : 0));
  const seen = new Set<string>();
  const deduped: SavedPrompt[] = [];
  for (const p of ordered) {
    const key = p.prompt.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(p);
  }
  map[userId] = deduped;
  writeAll(map);
  return getSavedPrompts(userId);
}

/** Delete a prompt. Returns the new list for the user. */
export function deletePrompt(userId: string, id: string): SavedPrompt[] {
  const map = readAll();
  map[userId] = listFor(userId, map).filter((p) => p.id !== id);
  writeAll(map);
  return getSavedPrompts(userId);
}

/** Starter prompts offered in the empty state — added by the user, never fake data. */
export const PROMPT_SUGGESTIONS: Array<{ title: string; prompt: string }> = [
  { title: "Summarize a paper", prompt: "Summarize the key findings, methods, and limitations of this paper in under 200 words." },
  { title: "Analyze a CSV", prompt: "Analyze this data: describe the columns, spot trends and anomalies, and suggest the three most important insights." },
  { title: "Explain this code", prompt: "Explain what this code does, line by line, and suggest any improvements or bugs you notice." },
  { title: "Translate a document", prompt: "Translate this document into the target language while preserving its tone and formatting." },
];
