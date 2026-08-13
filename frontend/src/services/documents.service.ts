import { useAuthStore } from "@/store/auth.store";

export interface DocumentItem {
  id: string;
  title: string;
  type: string;
  content: string;
  outline: string | null;
  sourceType: string | null;
  sourceId: string | null;
  sourceName: string | null;
  magicSlidesUrl: string | null;
  magicSlidesPdf: string | null;
  magicSlidesId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentRevision {
  id: string;
  documentId: string;
  content: string;
  createdAt: string;
}

export interface SourceOption {
  id: string;
  name: string;
  createdAt: string;
}

export interface DocumentSources {
  research: SourceOption[];
  meetings: SourceOption[];
  files: SourceOption[];
  conversations: SourceOption[];
}

const BASE = `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/documents`;

function token(): string {
  return useAuthStore.getState().accessToken || "";
}

async function handle(res: Response): Promise<any> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }
  return res.json();
}

export async function listDocuments(): Promise<DocumentItem[]> {
  const res = await fetch(`${BASE}/`, { headers: { Authorization: `Bearer ${token()}` } });
  const data = await handle(res);
  return data.documents || [];
}

export async function getDocument(id: string): Promise<DocumentItem> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  return handle(res);
}

export async function listRevisions(id: string): Promise<DocumentRevision[]> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}/revisions`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  const data = await handle(res);
  return data.revisions || [];
}

export async function createDocument(data: {
  title: string;
  type: string;
  sourceType?: string | null;
  sourceId?: string | null;
  sourceName?: string | null;
}): Promise<DocumentItem> {
  const res = await fetch(`${BASE}/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function saveDocument(id: string, content: string, title?: string): Promise<DocumentItem> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content, ...(title !== undefined ? { title } : {}) }),
  });
  return handle(res);
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token()}` },
  });
  await handle(res);
}

export async function getSources(): Promise<DocumentSources> {
  const res = await fetch(`${BASE}/sources`, { headers: { Authorization: `Bearer ${token()}` } });
  return handle(res);
}

export interface StreamHandlers {
  onStatus?: (stage: string) => void;
  onChunk?: (text: string) => void;
  onDone?: (payload: any) => void;
  onError?: (message: string) => void;
}

async function stream(url: string, handlers: StreamHandlers, method = "POST"): Promise<{ abort: () => void }> {
  const controller = new AbortController();
  (async () => {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token()}` },
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      let message = `Request failed (${res.status})`;
      try {
        const body = await res.json();
        if (body?.error) message = body.error;
      } catch {
        /* keep default */
      }
      handlers.onError?.(message);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const raw of events) {
          const lines = raw.split("\n");
          const event = lines.find((l) => l.startsWith("event: "))?.slice(7) || "message";
          const dataLine = lines.find((l) => l.startsWith("data: "))?.slice(6) || "";
          if (!dataLine) continue;
          let data: any = {};
          try {
            data = JSON.parse(dataLine);
          } catch {
            continue;
          }
          if (event === "status") handlers.onStatus?.(data.stage);
          else if (event === "chunk") handlers.onChunk?.(data.text || "");
          else if (event === "done") handlers.onDone?.(data);
          else if (event === "error") handlers.onError?.(data.message || "Operation failed");
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") handlers.onError?.(e?.message || "Connection lost");
    }
  })();
  return { abort: () => controller.abort() };
}

export async function streamOutline(
  topic: string,
  type: string,
  handlers: StreamHandlers
): Promise<{ abort: () => void }> {
  return stream(`${BASE}/outline?topic=${encodeURIComponent(topic)}&type=${encodeURIComponent(type)}`, handlers);
}

export async function streamGenerate(
  id: string,
  outline: string,
  handlers: StreamHandlers
): Promise<{ abort: () => void }> {
  return stream(`${BASE}/${encodeURIComponent(id)}/generate?outline=${encodeURIComponent(outline)}`, handlers);
}

/** Generate a real MagicSlides deck (PPTX + PDF) from the document (SSE). */
export async function streamMagicSlides(
  id: string,
  handlers: StreamHandlers
): Promise<{ abort: () => void }> {
  return stream(`${BASE}/${encodeURIComponent(id)}/magicslides`, handlers);
}

/** Authenticated download URL for real server-side exports. */
export function exportUrl(id: string, format: "md" | "html" | "pptx"): string {
  return `${BASE}/${encodeURIComponent(id)}/export/${format}?token=${encodeURIComponent(token())}`;
}
