import { env } from "../config/env";
import { logger } from "../config/logger";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const EMBED_MODEL = "nvidia/nv-embed-v1";

// Chunking: ~1000-char windows with a 150-char overlap so a retrieval unit is
// large enough to answer from but small enough to stay semantically focused.
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;
// Cap the number of chunks we embed per file — a 20k file is ~20 chunks, which
// is already more than enough signal for ranking; huge files stay bounded.
const MAX_CHUNKS = 48;
// Return the top-k most relevant chunks as context.
const TOP_K = 6;
// Don't bother retrieving from files that already fit in the full-text
// context budget — for small files the model should just see everything.
const MIN_FILE_CHARS = 4000;

/** Cosine similarity between two vectors (0..1). */
function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** Split text into overlapping chunks of roughly CHUNK_SIZE chars. */
function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length && chunks.length < MAX_CHUNKS) {
    let end = Math.min(start + CHUNK_SIZE, text.length);
    // Prefer breaking on a sentence/word boundary so chunks don't split mid-word.
    if (end < text.length) {
      const cut = text.lastIndexOf(". ", end);
      if (cut > start + CHUNK_SIZE / 2) end = cut + 1;
    }
    chunks.push(text.slice(start, end).trim());
    start = end - CHUNK_OVERLAP;
  }
  return chunks.filter((c) => c.length > 0);
}

/** Embed a list of strings with NVIDIA nv-embed-v1. */
async function embed(texts: string[], inputType: "query" | "passage"): Promise<number[][]> {
  const key = env.NVIDIA_NIM_API_KEY;
  if (!key) throw new Error("NVIDIA_NIM_API_KEY not configured");
  const res = await fetch(`${NVIDIA_BASE_URL}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts, input_type: inputType }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`NVIDIA embeddings error ${res.status}: ${body.slice(0, 160)}`);
  }
  const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
  const vectors = (data.data || []).map((d) => d.embedding || []);
  if (vectors.length !== texts.length) throw new Error("NVIDIA embeddings returned fewer vectors than inputs");
  return vectors;
}

/**
 * In-memory cache of chunk embeddings, keyed by a hash of the file text. Files
 * are immutable once extracted, so a repeated question on the same file skips
 * re-embedding every chunk — only the query is embedded per turn.
 */
const chunkCache = new Map<string, { chunks: string[]; vectors: number[][] }>();
const CHUNK_CACHE_MAX = 40;

function cacheKey(text: string): string {
  // FNV-1a — cheap and stable for cache identity (collisions just mean a
  // re-embed, which is harmless).
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `v1:${(h >>> 0).toString(16)}`;
}

/**
 * Retrieve the most relevant excerpts of a file for the user's query.
 *
 * Returns a string of the top-k chunks joined with separators, or null when
 * retrieval can't run (no key, too short, or any failure) so the caller falls
 * back to the existing full-text context. Retrieval is strictly an
 * enhancement — a search failure must never block a chat reply.
 */
export async function retrieveFileContext(query: string, fileText: string): Promise<string | null> {
  const text = (fileText || "").trim();
  if (!text || text.length < MIN_FILE_CHARS) return null;
  const q = (query || "").trim();
  if (!q) return null;

  const key = cacheKey(text);
  let entry = chunkCache.get(key);
  if (!entry) {
    try {
      const chunks = chunkText(text);
      if (!chunks.length) return null;
      const vectors = await embed(chunks, "passage");
      entry = { chunks, vectors };
      chunkCache.set(key, entry);
      if (chunkCache.size > CHUNK_CACHE_MAX) {
        // Drop the oldest entry (Map preserves insertion order).
        const oldest = chunkCache.keys().next().value;
        if (oldest) chunkCache.delete(oldest);
      }
    } catch (error) {
      logger.warn("File retrieval chunk embed failed, falling back to full text:", error instanceof Error ? error.message : error);
      return null;
    }
  }

  try {
    const queryVectors = await embed([q], "query");
    const queryVector = queryVectors[0];
    const ranked = entry.chunks
      .map((chunk, i) => ({ chunk, score: cosineSimilarity(queryVector, entry!.vectors[i]) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K);
    // Only return chunks that actually match; a totally unrelated query yields
    // weak scores and the caller falls back to full context.
    if (ranked.length === 0 || ranked[0].score < 0.25) return null;
    return ranked.map((r) => r.chunk).join("\n\n…\n\n");
  } catch (error) {
    logger.warn("File retrieval query embed failed, falling back to full text:", error instanceof Error ? error.message : error);
    return null;
  }
}
