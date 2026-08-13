import { env } from "../config/env";
import { logger } from "../config/logger";

// TinyFish Search API — free, no credits. Returns structured ranked results
// that we feed to the chat model as grounded context for research questions.
export interface SearchResult {
  position: number;
  title: string;
  snippet: string;
  url: string;
  site_name?: string;
  date?: string;
}

export async function searchWeb(
  query: string,
  opts?: { recencyMinutes?: number; maxResults?: number }
): Promise<SearchResult[]> {
  if (!env.TINYFISH_API_KEY) return [];
  const params = new URLSearchParams({ query });
  if (opts?.recencyMinutes) params.set("recency_minutes", String(opts.recencyMinutes));
  try {
    const res = await fetch(`https://api.search.tinyfish.ai?${params}`, {
      headers: { "X-API-Key": env.TINYFISH_API_KEY },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      logger.error(`TinyFish search failed (HTTP ${res.status})`);
      return [];
    }
    const data = (await res.json()) as { results?: SearchResult[] };
    const results = data.results || [];
    return results.slice(0, opts?.maxResults ?? 8);
  } catch (error) {
    logger.error("TinyFish search error:", error);
    return [];
  }
}

/** Format results as compact context the model can cite from. */
export function formatSearchResults(query: string, results: SearchResult[]): string {
  const lines = results.map(
    (r, i) =>
      `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}${r.date ? ` (${r.date})` : ""}`
  );
  return (
    `Web search results for "${query}":\n${lines.join("\n")}\n\n` +
    `Use these results to answer accurately. Cite sources by their URLs. ` +
    `If the results don't answer the question, say so rather than guessing.`
  );
}
