/**
 * Universal Command Center — intent routing.
 *
 * Maps a free-text command to a REAL feature in this application. Every route
 * here is an existing React Router path backed by an existing backend API.
 * This module is intentionally static (no network calls): suggestions and
 * routing happen locally, instantly, and never leak keys or hit APIs per
 * keystroke. If an intent has no matching feature, it falls back to Chat,
 * which is the universal default.
 */

export type IntentType =
  | "chat"
  | "image"
  | "video"
  | "voice"
  | "files"
  | "analytics"
  | "history"
  | "favorites"
  | "settings"
  | "agents"
  | "dashboard"
  | "memory"
  | "projects"
  | "meetings"
  | "workflows"
  | "data"
  | "research"
  | "documents"
  | "markets";

export interface IntentResult {
  type: IntentType;
  /** Action label shown in the UI, e.g. "Generate an image". */
  label: string;
  /** Explains where the command will go. */
  description: string;
  /** Existing route to navigate to (may carry a prefill param). */
  route: string;
}

const INTENT_META: Record<IntentType, { label: string; description: string }> = {
  chat: { label: "Chat with NexusAI", description: "Start a conversation" },
  image: { label: "Generate an image", description: "Open Image Studio with your prompt" },
  video: { label: "Generate a video", description: "Open Video Studio with your prompt" },
  voice: { label: "Voice & transcription", description: "Open Voice Studio" },
  files: { label: "Analyze a file", description: "Open Files & File Analyzer" },
  analytics: { label: "View analytics", description: "Open Analytics" },
  history: { label: "Recent chats", description: "Open History" },
  favorites: { label: "Favorites", description: "Open Favorites" },
  settings: { label: "Settings", description: "Open Settings" },
  agents: { label: "Agents", description: "Open Agents" },
  dashboard: { label: "Dashboard", description: "Go to the Dashboard" },
  memory: { label: "AI Memory", description: "See what NexusAI remembers about your workspace" },
  projects: { label: "Project Workspaces", description: "Open your shared project workspaces" },
  meetings: { label: "AI Meetings", description: "Open Meetings — live transcription, translation and summaries" },
  workflows: { label: "AI Workflows", description: "Open the Workflow Builder — visual automation over real capabilities" },
  data: { label: "Data Lab", description: "Analyze CSV/Excel/JSON datasets with real statistics and AI" },
  research: { label: "Research Studio", description: "Deep research — web + your files, synthesized with citations" },
  documents: { label: "Document Studio", description: "Create reports, articles, proposals and presentations with AI" },
  markets: { label: "Markets Studio", description: "Real Massive.com stock data + one-click deep research" },
};

/** Phrases that introduce an image command; stripped to leave the subject. */
const IMAGE_STRIP = [
  /generate(?: an?| the)? image(?: of| about)?/i,
  /create(?: an?| the)? image(?: of| about)?/i,
  /make(?: an?| the)? image(?: of| about)?/i,
  /produce(?: an?| the)? image(?: of| about)?/i,
  /^(?:an?|the)? ?image of/i,
  /^(?:an?|the)? ?picture of/i,
  /^(?:draw|paint|sketch)(?: me)?/i,
];

const VIDEO_STRIP = [
  /generate(?: an?| the)? video(?: of| about)?/i,
  /create(?: an?| the)? video(?: of| about)?/i,
  /make(?: an?| the)? video(?: of| about)?/i,
  /produce(?: an?| the)? video(?: of| about)?/i,
  /^(?:an?|the)? ?video (?:of|about)/i,
];

const FILE_STRIP = [
  /analyze (?:this|my|the|a)?/i,
  /summar(?:ize|ise) (?:this|my|the|a)?/i,
  /^read (?:this|my|the|a)?/i,
  /^upload/i,
];

/** Remove matching intro phrases, collapsing leftover whitespace/punctuation. */
function stripPhrases(input: string, patterns: RegExp[]): string {
  let out = input;
  for (const p of patterns) out = out.replace(p, " ");
  return out.replace(/[,.;:!?]+/g, " ").replace(/\s+/g, " ").trim();
}

const SUBJECT_FOR: Partial<Record<IntentType, RegExp[]>> = {
  image: IMAGE_STRIP,
  video: VIDEO_STRIP,
  files: FILE_STRIP,
};

const KEYWORD_RULES: Array<{ type: IntentType; match: RegExp }> = [
  { type: "dashboard", match: /\b(dashboard|go home|home page)\b/i },
  { type: "image", match: /\b(generate|create|make|produce|draw|design).*(image|picture|photo|art|logo|wallpaper)\b/i },
  { type: "image", match: /\b(image|picture|photo|art|logo|wallpaper) of\b/i },
  { type: "image", match: /^(?:draw|paint|sketch)(?: me)?\b/i },
  { type: "video", match: /\b(generate|create|make|produce).*(video|animation|clip|reel)\b/i },
  { type: "video", match: /\bvideo (of|about)\b/i },
  { type: "voice", match: /\b(transcrib|speech.to.text|voice note|voice message|audio)\b/i },
  { type: "files", match: /\b(analyze|analy[sz]e|summar|summariz|extract|parse|read|upload).*(file|pdf|docx?|xlsx?|csv|document|sheet|report|resume|cv|image|photo)\b/i },
  { type: "files", match: /\b(analy[sz]e|summar[yi]z?e|extract|read) (this|my|the|a)\b/i },
  { type: "analytics", match: /\b(analytics|usage|stats?|statistics|report)\b/i },
  { type: "history", match: /\b(history|recent (chats|conversations|files))\b/i },
  { type: "favorites", match: /\b(favorites|favourites|pinned|starred)\b/i },
  { type: "settings", match: /\b(settings|change password|update profile|appearance|notifications|connected accounts)\b/i },
  { type: "agents", match: /\bagents?\b/i },
  { type: "memory", match: /\b(memory|remember|knowledge|what (do|does).*(know|remember)|(remember|forget).*about me)\b/i },
  { type: "projects", match: /\b(projects?|workspace|collaborat|team|invite)\b/i },
  { type: "meetings", match: /\b(meeting|meet with ai|start a meeting|meeting notes|agenda)\b/i },
  { type: "workflows", match: /\b(workflow|automation|pipeline|workflow builder)\b/i },
  { type: "data", match: /\b(analy[sz]e|analy[sz]e data|analy[sz]e my|question|insights?|charts?|visuali[sz]).*(csv|excel|xlsx|dataset|spreadsheet|data)\b/i },
  { type: "data", match: /\b(data lab|dataset|datasets|spreadsheet|excel|csv)\b/i },
  { type: "research", match: /\b(research|deep research|research studio|sources|citations?|find evidence|compare sources)\b/i },
  { type: "markets", match: /\b(stock|stocks|ticker|tickers|market data|markets studio|quote|share price|dividend)\b/i },
  { type: "markets", match: /\b(\$?[A-Z]{1,5})\b.*\b(stock|market|ticker)\b/i },
  { type: "documents", match: /\b(create|write|make|generate|draft).*(report|document|article|proposal|presentation|ppt|slides|notes|essay)\b/i },
  { type: "documents", match: /\b(document studio|new document|write a report|make a presentation|create a (report|proposal|presentation))\b/i },
  { type: "chat", match: /\b(new chat|start a? chat|chat)\b/i },
];

export function detectIntent(raw: string): IntentResult {
  const input = raw.trim().replace(/\s+/g, " ");
  if (!input) {
    return { type: "chat", ...INTENT_META.chat, route: "/chat" };
  }

  let intent: IntentType | null = null;
  for (const rule of KEYWORD_RULES) {
    if (rule.match.test(input)) {
      intent = rule.type;
      break;
    }
  }
  const type = intent ?? "chat";
  const meta = INTENT_META[type];
  const strip = SUBJECT_FOR[type];

  const subject = strip ? stripPhrases(input, strip) : "";

  let route: string;
  switch (type) {
    case "image":
      route = subject ? `/image-studio?prompt=${encodeURIComponent(subject)}` : "/image-studio";
      break;
    case "video":
      route = subject ? `/video-studio?prompt=${encodeURIComponent(subject)}` : "/video-studio";
      break;
    case "voice":
      route = "/voice";
      break;
    case "files":
      route = "/files";
      break;
    case "analytics":
      route = "/analytics";
      break;
    case "history":
      route = "/history";
      break;
    case "favorites":
      route = "/favorites";
      break;
    case "settings":
      route = "/settings";
      break;
    case "agents":
      route = "/agents";
      break;
    case "dashboard":
      route = "/dashboard";
      break;
    case "memory":
      route = "/memory";
      break;
    case "projects":
      route = "/projects";
      break;
    case "meetings":
      route = "/meetings";
      break;
    case "workflows":
      route = "/workflows";
      break;
    case "data":
      route = "/data-lab";
      break;
    case "research":
      route = "/research";
      break;
    case "documents":
      route = "/documents";
      break;
    case "markets":
      route = "/markets";
      break;
    case "chat":
    default:
      route = `/chat?q=${encodeURIComponent(input)}`;
      break;
  }

  return { type, ...meta, route };
}

/* ------------------------------------------------------------------ */
/* Autocomplete suggestions — only features that actually exist.       */
/* ------------------------------------------------------------------ */

interface Suggestion {
  id: IntentType;
  keywords: string[];
  text: string;
}

const SUGGESTIONS: Suggestion[] = [
  { id: "files", keywords: ["analy", "summar", "document", "pdf", "csv", "file", "report"], text: "Analyze a file" },
  { id: "image", keywords: ["generate im", "create im", "image", "picture", "draw", "logo", "art"], text: "Generate an image" },
  { id: "video", keywords: ["generate vid", "create vid", "video", "animation"], text: "Generate a video" },
  { id: "voice", keywords: ["transcrib", "audio", "voice", "speech"], text: "Transcribe audio" },
  { id: "chat", keywords: ["write", "code", "email", "explain", "help", "story", "poem"], text: "Write with NexusAI" },
  { id: "analytics", keywords: ["analytics", "usage", "stats", "statistics"], text: "Show my usage" },
  { id: "history", keywords: ["history", "recent"], text: "Open recent chats" },
  { id: "settings", keywords: ["settings", "password", "profile", "theme"], text: "Change settings" },
  { id: "memory", keywords: ["memory", "remember", "knowledge", "know about me"], text: "Open AI Memory" },
  { id: "projects", keywords: ["project", "workspace", "team", "collaborate"], text: "Open Project Workspaces" },
  { id: "meetings", keywords: ["meeting", "meet", "agenda", "meeting notes"], text: "Start an AI Meeting" },
  { id: "workflows", keywords: ["workflow", "automation", "pipeline", "automate"], text: "Open the Workflow Builder" },
  { id: "data", keywords: ["data lab", "dataset", "csv", "excel", "spreadsheet", "analyze data"], text: "Analyze a dataset in Data Lab" },
  { id: "research", keywords: ["research", "deep search", "sources", "citations", "find evidence"], text: "Open the Research Studio" },
  { id: "documents", keywords: ["report", "document", "presentation", "ppt", "proposal", "write"], text: "Open the Document Studio" },
  { id: "markets", keywords: ["stock", "ticker", "markets", "quote", "dividend", "share price"], text: "Look up a stock in Markets Studio" },
];

export function suggestCommands(query: string): Suggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return SUGGESTIONS;
  // Match when the query starts the keyword OR the keyword starts the query,
  // so typing a partial prefix like "gener" surfaces "Generate an image".
  return SUGGESTIONS.filter((s) => s.keywords.some((k) => q.startsWith(k) || k.startsWith(q)));
}

/* ------------------------------------------------------------------ */
/* Recent commands — localStorage only (no DB change needed).          */
/* ------------------------------------------------------------------ */

const RECENT_KEY = "nexusai-command-history";
const MAX_RECENT = 6;

export function getRecentCommands(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(list) ? list.filter((c) => typeof c === "string") : [];
  } catch {
    return [];
  }
}

export function addRecentCommand(command: string): void {
  const text = command.trim();
  if (!text) return;
  try {
    const list = [text, ...getRecentCommands().filter((c) => c !== text)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* ignore storage failures */
  }
}
