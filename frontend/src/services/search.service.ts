import { api } from "./api";

export type SearchResultType = "conversation" | "message" | "file" | "audio" | "image";

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  snippet: string;
  createdAt: string;
  updatedAt: string;
  meta: Record<string, any>;
}

interface SearchResponse {
  query: string;
  results: SearchResult[];
}

export interface LocalImage {
  url: string;
  prompt: string;
  model: string;
  createdAt: number;
}

const IMAGE_GALLERY_KEY = "nexusai-image-gallery";

/**
 * The image gallery lives on-device (localStorage), so the backend search
 * can't see it. These are REAL generated images with their real prompts —
 * searched locally and merged into the same result list.
 */
export function searchLocalImages(query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  try {
    const raw = localStorage.getItem(IMAGE_GALLERY_KEY);
    if (!raw) return [];
    const list: LocalImage[] = JSON.parse(raw);
    return list
      .filter((img) => (img.prompt || "").toLowerCase().includes(q) || (img.model || "").toLowerCase().includes(q))
      .slice(0, 5)
      .map((img) => ({
        type: "image" as const,
        id: `img-${img.createdAt}`,
        title: "Generated image",
        snippet: img.prompt,
        createdAt: new Date(img.createdAt).toISOString(),
        updatedAt: new Date(img.createdAt).toISOString(),
        meta: { url: img.url, prompt: img.prompt, model: img.model },
      }));
  } catch {
    return [];
  }
}

export const searchService = {
  /** Debounce-friendly global search over the signed-in user's own data. */
  search: (q: string) => api.get<SearchResponse>("/search", { params: { q } }),
};
