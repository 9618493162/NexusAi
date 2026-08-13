import { useAuthStore } from "@/store/auth.store";

export interface ResearchSource {
  id: string;
  researchId: string;
  kind: "web" | "file";
  title: string;
  url: string | null;
  snippet: string;
  date: string | null;
  relevance: number | null;
  fileId: string | null;
  createdAt: string;
}

export interface ResearchFinding {
  claim: string;
  detail: string;
  citations: string[];
}

export interface ResearchResult {
  summary: string;
  findings: ResearchFinding[];
  conclusion: string;
}

export interface ResearchSession {
  id: string;
  query: string;
  mode: "quick" | "deep";
  summary: string | null;
  report: string | null;
  status: "draft" | "completed" | "failed";
  error: string | null;
  createdAt: string;
  updatedAt: string;
  sources?: ResearchSource[];
  _count?: { sources: number };
}

const BASE = `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/research`;

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

export async function listResearch(): Promise<ResearchSession[]> {
  const res = await fetch(`${BASE}/`, { headers: { Authorization: `Bearer ${token()}` } });
  const data = await handle(res);
  return data.research || [];
}

export async function getResearch(id: string): Promise<ResearchSession> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  return handle(res);
}

export async function createResearch(query: string, mode: string): Promise<ResearchSession> {
  const res = await fetch(`${BASE}/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, mode }),
  });
  return handle(res);
}

export async function deleteResearch(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token()}` },
  });
  await handle(res);
}

export interface RunHandlers {
  onStage?: (stage: string, sourceCount?: number) => void;
  onChunk?: (text: string) => void;
  onDone?: (result: ResearchResult, sources: ResearchSource[]) => void;
  onError?: (message: string) => void;
}

/** Run a research session, streaming real status + synthesis over SSE. */
export function runResearch(
  id: string,
  handlers: RunHandlers
): { abort: () => void } {
  const controller = new AbortController();
  (async () => {
    const res = await fetch(`${BASE}/${encodeURIComponent(id)}/run`, {
      method: "POST",
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

    const read = async () => {
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
            if (event === "status") handlers.onStage?.(data.stage, data.sourceCount);
            else if (event === "chunk") handlers.onChunk?.(data.text || "");
            else if (event === "done") handlers.onDone?.(data.result, data.sources || []);
            else if (event === "error") handlers.onError?.(data.message || "Research failed");
          }
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") handlers.onError?.(e?.message || "Connection lost");
      }
    };
    void read();
  })();

  return { abort: () => controller.abort() };
}
