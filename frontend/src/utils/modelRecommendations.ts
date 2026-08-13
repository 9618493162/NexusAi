// Best-model recommendations for the Quick Actions cards, plus a lightweight
// "Auto" picker that chooses the model from the task (or message keywords).
// When a user manually picks a model while a task is active, that choice is
// remembered per task so Auto uses it next time.

const TASK_MODEL_KEY = "nexusai-task-models";

function readTaskModels(): Record<string, string> {
  try {
    const raw = localStorage.getItem(TASK_MODEL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

// Model the user last chose for a task (Auto uses it as the preferred pick).
export function getSavedTaskModel(task: string): string | undefined {
  return readTaskModels()[task];
}

// Model the user last chose without a task (Auto's global default).
export function getSavedDefaultModel(): string | undefined {
  return readTaskModels()._default;
}

// Remember a manual model choice so Auto prefers it next time.
export function rememberTaskModel(task: string, model: string): void {
  try {
    const map = readTaskModels();
    map[task || "_default"] = model;
    localStorage.setItem(TASK_MODEL_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

export const TASK_MODELS: Record<
  string,
  { model: string; prompt: string }
> = {
  creative: {
    model: "mistral-large-latest",
    prompt: "Let's create something together — give me a story, poem, or scene to start with:",
  },
  code: {
    model: "codestral-latest",
    prompt: "I'd like help writing or debugging code. Here's what I'm working on:",
  },
  document: {
    model: "gemini-3.5-flash",
    prompt: "Help me summarize and analyze this document:",
  },
  research: {
    model: "gemini-3.5-flash",
    prompt: "Help me research this topic:",
  },
  "quick-tasks": {
    model: "gemini-3.5-flash",
    prompt: "Let's knock out a quick task — emails, lists, or anything small:",
  },
  analytics: {
    model: "gemini-3.5-flash",
    prompt: "Help me analyze this data:",
  },
};

// The reliable free default when nothing points elsewhere (Groq's default key
// is dead, so "Auto" never falls back to it). Note: use the concrete
// gemini-3.5-flash, NOT the "-latest" alias — the alias endpoint stalls the
// SSE stream on some Node runtimes (undici), which hangs the whole reply.
export const AUTO_DEFAULT_MODEL = "gemini-3.5-flash";

// Pick the best model for a message, given an optional task context from a
// Quick Action card. A model the user previously chose for that task wins;
// otherwise the task's default; otherwise a few keyword heuristics.
export function recommendModel(message: string, task?: string): string {
  if (task) {
    const saved = getSavedTaskModel(task);
    if (saved) return saved;
    if (TASK_MODELS[task]) return TASK_MODELS[task].model;
  }
  const m = message.toLowerCase();
  if (/\b(code|debug|bug|function|error|script|javascript|typescript|python|sql|regex|component|snippet)\b/.test(m)) {
    return "codestral-latest";
  }
  if (/\b(poem|poetry|story|essay|creative|fiction|novel|write a|rewrite)\b/.test(m)) {
    return "mistral-large-latest";
  }
  if (/\b(analyz|analysis|chart|data|report|summariz|research|investigat)\b/.test(m)) {
    return "gemini-3.5-flash";
  }
  return getSavedDefaultModel() || AUTO_DEFAULT_MODEL;
}
