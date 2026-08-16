import { prisma } from "../config/database";
import { searchWeb, SearchResult } from "./search.service";
import { streamChat } from "./chat.service";
import { logger } from "../config/logger";
import { researchMarket, detectTickers } from "./market.service";

/**
 * Research & Deep Search engine.
 *
 * Reuses the existing real capabilities:
 *  - web search: the TinyFish-backed `searchWeb` already used to ground chat
 *  - file search: the signed-in user's own uploaded files (`extractedText`)
 *  - AI synthesis: the existing `streamChat` pipeline
 *
 * Sources are never invented — only what `searchWeb` returns and the user's
 * own files are stored. Citations map 1:1 to those stored sources.
 */

/** Try providers in order — research must survive a single provider outage. */
async function* streamWithFallback(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  userId: string
): AsyncGenerator<string, void, unknown> {
  const candidates = ["gemini-flash-latest", "llama-3.3-70b-versatile", "qwen/qwen3.6-27b"];
  let lastError: unknown = null;
  for (const model of candidates) {
    try {
      yield* streamChat(messages, model, userId, "research");
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("All AI providers failed.");
}

export interface ResearchSourceInput {
  kind: "web" | "file";
  title: string;
  url?: string | null;
  snippet: string;
  date?: string | null;
  relevance?: number | null;
  fileId?: string | null;
}

export interface ResearchFinding {
  claim: string;
  detail: string;
  citations: string[]; // source ids
}

export interface ResearchResult {
  summary: string;
  findings: ResearchFinding[];
  conclusion: string;
}

const FILE_SNIPPET_CHARS = 900;
const FILE_LIMIT = 5;
const WEB_LIMIT = 8;

/** Escape LIKE wildcards so user input matches literally. */
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** Find the user's own files whose extracted text matches the query terms. */
export async function findRelevantFiles(userId: string, query: string): Promise<ResearchSourceInput[]> {
  const terms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3)
    .slice(0, 6);

  const files = await prisma.file.findMany({
    where: { userId, extractedText: { not: { equals: null } } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const scored: Array<{ file: (typeof files)[number]; score: number; snippet: string }> = [];
  for (const f of files) {
    const text = f.extractedText || "";
    if (!text.trim()) continue;
    let score = 0;
    let snippet = "";
    const lower = text.toLowerCase();
    for (const t of terms) {
      if (lower.includes(t)) {
        score += 1;
        const idx = lower.indexOf(t);
        snippet = text.slice(Math.max(0, idx - 160), idx + FILE_SNIPPET_CHARS);
      }
    }
    if (score === 0 && terms.length === 0) {
      score = 1;
      snippet = text.slice(0, FILE_SNIPPET_CHARS);
    }
    if (score > 0) {
      scored.push({ file: f, score, snippet: snippet.slice(0, FILE_SNIPPET_CHARS) });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, FILE_LIMIT).map((s) => {
    const snippet = s.snippet || (s.file.extractedText || "").slice(0, FILE_SNIPPET_CHARS);
    return {
      kind: "file" as const,
      title: s.file.originalName,
      url: null,
      snippet,
      fileId: s.file.id,
    };
  });
}

function buildPrompt(query: string, sources: ResearchSourceInput[], deep: boolean): string {
  const lines = sources.map(
    (s, i) =>
      `[${i + 1}] ${s.kind === "web" ? "WEB" : "FILE"}: ${s.title}${s.url ? ` — ${s.url}` : ""}\n    ${s.snippet.slice(0, 600)}`
  );

  return [
    `Research question: ${query}`,
    "",
    "SOURCES (real search results and the user's own files):",
    ...lines,
    "",
    `Write a ${deep ? "thorough, multi-paragraph" : "concise"} research synthesis that answers the question using ONLY these sources.`,
    "Rules:",
    "- Cite sources with [n] markers matching the numbered list above.",
    "- Never invent sources, URLs, dates or facts not present in the sources.",
    "- If the sources do not answer the question, say so plainly instead of guessing.",
    "- If sources conflict, present both sides explicitly.",
    "Return ONLY a JSON object with this exact shape:",
    JSON.stringify({
      summary: "2-4 sentence executive summary",
      findings: [
        { claim: "a key claim", detail: "supporting detail with [n] citations", citations: ["1", "3"] },
      ],
      conclusion: "closing synthesis",
    }),
  ].join("\n");
}

/** Extract the JSON object from an AI reply (tolerant of markdown fences). */
export function parseSynthesis(raw: string): ResearchResult | null {
  const cleaned = raw.replace(/```(?:json)?\s*/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && (parsed.summary || parsed.findings)) {
      return {
        summary: String(parsed.summary || ""),
        findings: Array.isArray(parsed.findings)
          ? parsed.findings
              .filter((f: any) => f && f.claim)
              .map((f: any) => ({
                claim: String(f.claim),
                detail: String(f.detail || ""),
                citations: Array.isArray(f.citations) ? f.citations.map(String) : [],
              }))
          : [],
        conclusion: String(parsed.conclusion || ""),
      };
    }
  } catch {
    // fall through to bracket extraction
  }
  // Tolerant fallback: extract the object if it sits between { } even with prose around it.
  try {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      if (parsed && typeof parsed === "object") {
        return {
          summary: String(parsed.summary || ""),
          findings: Array.isArray(parsed.findings)
            ? parsed.findings
                .filter((f: any) => f && f.claim)
                .map((f: any) => ({
                  claim: String(f.claim),
                  detail: String(f.detail || ""),
                  citations: Array.isArray(f.citations) ? f.citations.map(String) : [],
                }))
            : [],
          conclusion: String(parsed.conclusion || ""),
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** Map citation numbers back to stored source ids. */
export function mapCitations(
  finding: ResearchFinding,
  sources: Array<{ id: string; index: number }>
): ResearchFinding {
  const ids: string[] = [];
  for (const c of finding.citations) {
    const n = parseInt(c, 10);
    const s = sources.find((x) => x.index === n);
    if (s && !ids.includes(s.id)) ids.push(s.id);
  }
  return { ...finding, citations: ids };
}

export interface ResearchRunOutput {
  result: ResearchResult;
  sources: Array<ResearchSourceInput & { id: string }>;
  raw: string;
}

export async function runResearch(
  userId: string,
  researchId: string,
  query: string,
  mode: string,
  onEvent: (event: { type: string; [k: string]: any }) => void
): Promise<void> {
  const deep = mode === "deep";
  const sourceInputs: ResearchSourceInput[] = [];

  onEvent({ type: "status", stage: "searching" });

  // 1. Real web search (existing TinyFish service, best-effort).
  const web = await searchWeb(query, { recencyMinutes: 525600, maxResults: deep ? 10 : WEB_LIMIT });
  for (const r of web) {
    sourceInputs.push({
      kind: "web",
      title: r.title || r.url,
      url: r.url,
      snippet: r.snippet || "",
      date: r.date || null,
      relevance: r.position ? Math.max(0, 1 - (r.position - 1) * 0.08) : null,
    });
  }

  // 1b. Massive.com market data for any tickers in the query (real, free-tier:
  // ticker reference, news with sentiment, dividends — key server-side only).
  onEvent({ type: "status", stage: "market" });
  let marketContext = "";
  const tickers = detectTickers(query);
  if (tickers.length) {
    const market = await researchMarket(query, tickers);
    marketContext = market.context;
    for (const d of market.tickers) {
      sourceInputs.push({
        kind: "file",
        title: `Market: ${d.ticker} — ${d.name}`,
        url: null,
        snippet: `Ticker ${d.ticker}: ${d.name}${d.marketCap ? `, market cap $${(d.marketCap / 1e12).toFixed(2)}T` : ""}. Real data from Massive.com.`,
      });
    }
    for (const div of market.dividends) {
      sourceInputs.push({
        kind: "file",
        title: `Dividend: ${div.ticker}`,
        url: null,
        snippet: `Dividend $${div.cashAmount} per share (ex-date ${div.exDividendDate || "n/a"}). Real data from Massive.com.`,
      });
    }
    for (const n of market.news) {
      sourceInputs.push({
        kind: "web",
        title: n.title,
        url: n.articleUrl || null,
        snippet: `${n.summary || ""}${n.publisher ? ` (${n.publisher})` : ""}${n.sentiment ? ` [sentiment: ${n.sentiment}]` : ""}`.slice(0, 900),
        date: n.publishedUtc ? new Date(n.publishedUtc).toISOString().slice(0, 10) : null,
      });
    }
  }

  // 2. The user's own relevant files (ownership-scoped, never leaks).
  onEvent({ type: "status", stage: "files" });
  const files = await findRelevantFiles(userId, query);
  sourceInputs.push(...files);

  onEvent({ type: "status", stage: "analyzing", sourceCount: sourceInputs.length });

  if (sourceInputs.length === 0) {
    throw new Error("No sources found. Try rephrasing the question, or check your connection to the web search service.");
  }

  // 3. Persist the real sources so citations resolve after the run.
  const created: Array<{ id: string; index: number }> = [];
  for (let i = 0; i < sourceInputs.length; i++) {
    const s = sourceInputs[i];
    const row = await prisma.researchSource.create({
      data: {
        researchId,
        kind: s.kind,
        title: s.title.slice(0, 500),
        url: s.url,
        snippet: s.snippet.slice(0, 2000),
        date: s.date,
        relevance: s.relevance,
        fileId: s.fileId,
      },
    });
    created.push({ id: row.id, index: i + 1 });
  }

  // 4. AI synthesis through the existing chat pipeline.
  onEvent({ type: "status", stage: "writing" });
  const messages = [
    { role: "system" as const, content: "You are a precise research analyst. You synthesize findings from the provided sources only, with [n] citations." },
    {
      role: "user" as const,
      content:
        (marketContext ? `${marketContext}\n\n` : "") + buildPrompt(query, sourceInputs, deep),
    },
  ];

  let full = "";
  for await (const chunk of streamWithFallback(messages, userId)) {
    full += chunk;
    onEvent({ type: "chunk", text: chunk });
  }

  const result = parseSynthesis(full);
  if (!result) {
    throw new Error("The research model did not return a structured answer. Please try again.");
  }

  // 5. Map citations to persisted source ids and persist the finished report.
  const withIds = result.findings.map((f) => mapCitations(f, created));
  const finalResult: ResearchResult = { ...result, findings: withIds };

  await prisma.research.update({
    where: { id: researchId },
    data: {
      status: "completed",
      summary: JSON.stringify(finalResult),
      report: full,
      error: null,
    },
  });

  onEvent({
    type: "done",
    result: finalResult,
    sources: sourceInputs.map((s, i) => ({ ...s, id: created[i].id })),
  });
}

/* ---------- CRUD (ownership-scoped) ---------- */

export async function listResearch(userId: string) {
  return prisma.research.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { sources: true } } },
    take: 50,
  });
}

export async function getResearch(userId: string, id: string) {
  return prisma.research.findFirst({
    where: { id, userId },
    include: { sources: { orderBy: { createdAt: "asc" } } },
  });
}

export async function createResearch(userId: string, query: string, mode: string) {
  return prisma.research.create({
    data: {
      query: query.trim().slice(0, 500) || "Untitled research",
      mode: mode === "deep" ? "deep" : "quick",
      status: "draft",
      userId,
    },
  });
}

export async function deleteResearch(userId: string, id: string) {
  const existing = await prisma.research.findFirst({ where: { id, userId } });
  if (!existing) return null;
  return prisma.research.delete({ where: { id } });
}

export async function logSearchFailure(err: unknown): Promise<void> {
  logger.error("Research run error:", err);
}
