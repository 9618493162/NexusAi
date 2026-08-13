/**
 * Resource deep-linking for command bars.
 *
 * Given free text like "open project launch research" or "join meeting Q4",
 * matches the name against the caller's REAL resources (projects, meetings,
 * conversations) and returns a deep link into the specific record. When the
 * pattern matched but no resource does, it routes to that kind's hub page —
 * the user clearly meant a resource, so chat is the wrong fallback. Returns
 * null when the text isn't a resource command at all, so callers keep their
 * normal intent routing (chat by default).
 *
 * Matching is fuzzy but conservative: word-boundary phrase containment and
 * word overlap only, so "launch" never matches a project named "Launcher".
 */

export interface ResourceInput {
  projects?: Array<{ id: string; name: string }>;
  meetings?: Array<{ id: string; title: string }>;
  conversations?: Array<{ id: string; title: string }>;
}

export type ResourceKind = "project" | "meeting" | "chat";

export interface ResourceMatch {
  kind: ResourceKind;
  route: string;
  label: string;
  /** The name/title the user asked for (kept for hub fallbacks). */
  askedFor: string;
  /** True when an exact resource was found; false when routed to a hub. */
  matched: boolean;
}

const PROJECT_VERBS = "open|go to|show me|show|view|take me to|navigate to|access|find";
const MEETING_VERBS = "join|open|go to|resume|view|show|show me|take me to|navigate to|start";
const CHAT_VERBS = "open|go to|resume|continue|view|show|take me to|navigate to|jump back to";

const PATTERNS: Record<ResourceKind, RegExp[]> = {
  project: [
    new RegExp(`\\b(?:${PROJECT_VERBS})\\s+(?:the\\s+)?project\\s+(?:called|named|titled|entitled)\\s+(.+)$`, "i"),
    new RegExp(`\\b(?:${PROJECT_VERBS})\\s+(?:the\\s+)?project\\s+(?:"|'|“|”)?(.+?)(?:"|'|“|”)?$`, "i"),
    new RegExp(`\\bproject\\s+(?:called|named|titled|entitled)\\s+(?:"|'|“|”)?(.+?)(?:"|'|“|”)?$`, "i"),
  ],
  meeting: [
    new RegExp(`\\b(?:${MEETING_VERBS})\\s+(?:the\\s+)?meeting\\s+(?:called|named|titled|entitled)\\s+(.+)$`, "i"),
    new RegExp(`\\b(?:${MEETING_VERBS})\\s+(?:the\\s+)?meeting\\s+(?:"|'|“|”)?(.+?)(?:"|'|“|”)?$`, "i"),
    new RegExp(`\\bmeeting\\s+(?:called|named|titled|entitled)\\s+(?:"|'|“|”)?(.+?)(?:"|'|“|”)?$`, "i"),
  ],
  chat: [
    new RegExp(`\\b(?:${CHAT_VERBS})\\s+(?:the\\s+)?(?:chat|conversation)\\s+(?:(?:called|named|about|on|titled|entitled)\\s+)?(.+)$`, "i"),
  ],
};

/** Words that don't name a resource — "open meeting notes" isn't a deep link. */
const STOPWORDS = new Set([
  "my", "the", "a", "an", "our", "your", "this", "that", "it", "them",
  "about", "called", "named", "notes", "agenda", "latest", "new", "next",
]);

function words(s: string): string[] {
  return s.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Strip quotes and filler words, returning null when nothing usable remains. */
function cleanName(raw: string): string | null {
  let name = raw.trim().replace(/^["'“”]+|["'“”]+$/g, "").replace(/\s+/g, " ").trim();
  name = name.replace(/^(?:the|my|our|your|a|an)\s+/i, "");
  name = name.replace(/\s+(?:please|now|right now|thanks|thank you)$/i, "");
  if (!name) return null;
  const w = words(name);
  if (w.length === 1 && STOPWORDS.has(w[0])) return null;
  return name;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWord(hay: string, word: string): boolean {
  return new RegExp(`\\b${escapeRegExp(word)}\\b`).test(hay);
}

/** Whole phrase contained as a consecutive word run (word-boundary safe). */
function containsPhrase(hay: string, needle: string): boolean {
  const hw = hay.split(" ");
  const nw = needle.split(" ");
  outer: for (let i = 0; i + nw.length <= hw.length; i++) {
    for (let j = 0; j < nw.length; j++) {
      if (hw[i + j] !== nw[j]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * 0..1 similarity between a user's words and a resource's name.
 * Exact > consecutive phrase containment > all query words present > overlap.
 */
function score(q: string[], n: string[]): number {
  if (q.length === 0 || n.length === 0) return 0;
  const qs = q.join(" ");
  const ns = n.join(" ");
  if (qs === ns) return 1;
  if (ns.length >= qs.length ? containsPhrase(ns, qs) : containsPhrase(qs, ns)) return 0.9;
  if (q.every((w) => hasWord(ns, w))) return 0.85;
  const overlap = n.filter((w) => hasWord(qs, w)).length;
  if (overlap === 0) return 0;
  return 0.4 + 0.4 * (overlap / n.length);
}

const MIN_SCORE = 0.7;

function bestMatch<T extends { id: string }>(
  queryWords: string[],
  items: T[],
  getName: (item: T) => string
): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const item of items) {
    const s = score(queryWords, words(getName(item)));
    if (s > bestScore) {
      bestScore = s;
      best = item;
    }
  }
  return bestScore >= MIN_SCORE ? best : null;
}

export function matchResourceCommand(raw: string, resources: ResourceInput): ResourceMatch | null {
  const input = raw.trim().replace(/\s+/g, " ");
  if (!input) return null;

  const kinds: ResourceKind[] = ["project", "meeting", "chat"];
  for (const kind of kinds) {
    for (const pattern of PATTERNS[kind]) {
      const m = input.match(pattern);
      if (!m) continue;
      const asked = cleanName(m[1]);
      if (!asked) continue;

      const list =
        kind === "project"
          ? (resources.projects ?? []).map((p) => ({ id: p.id, name: p.name }))
          : kind === "meeting"
            ? (resources.meetings ?? []).map((m2) => ({ id: m2.id, name: m2.title }))
            : (resources.conversations ?? []).map((c) => ({ id: c.id, name: c.title }));

      const found = bestMatch(words(asked), list, (item) => item.name);
      if (found) {
        const name = found.name;
        return {
          kind,
          route:
            kind === "project" ? `/projects/${found.id}` : kind === "meeting" ? `/meetings/${found.id}` : `/chat/${found.id}`,
          label:
            kind === "project"
              ? `Open project “${name}”`
              : kind === "meeting"
                ? `Open meeting “${name}”`
                : `Open conversation “${name}”`,
          askedFor: asked,
          matched: true,
        };
      }

      // Pattern matched but nothing found — the user meant a resource, so go
      // to that kind's hub (or prefill chat) instead of the generic fallback.
      return {
        kind,
        route:
          kind === "project" ? "/projects" : kind === "meeting" ? "/meetings" : `/chat?q=${encodeURIComponent(asked)}`,
        label:
          kind === "project"
            ? "Open Project Workspaces"
            : kind === "meeting"
              ? "Open Meetings"
              : `Ask NexusAI about “${asked}”`,
        askedFor: asked,
        matched: false,
      };
    }
  }
  return null;
}
