import { useAuthStore } from "@/store/auth.store";

export interface DataFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  format: "csv" | "tsv" | "json" | "jsonl" | "xlsx" | "other";
  analyzable: boolean;
  hasExtractedText: boolean;
}

export interface ColumnInfo {
  name: string;
  index: number;
  type: "number" | "date" | "boolean" | "text";
  missing: number;
  unique: number;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  sum?: number;
}

export interface DatasetOverview {
  fileId: string;
  originalName: string;
  mimeType: string;
  size: number;
  format: "csv" | "tsv" | "json" | "jsonl" | "xlsx" | "other";
  rows: number;
  columns: number;
  columnNames: string[];
  missingCells: number;
  duplicateRows: number;
  columnsInfo: ColumnInfo[];
  preview: Record<string, string | number | boolean | null>[];
  notes: string[];
}

export interface MarketDataset {
  ticker: string;
  kind: "market";
  fetchedAt: string;
  dividends: DatasetOverview;
  news: DatasetOverview;
}

export type MarketTable = "dividends" | "news";

const BASE = `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/data`;

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

export async function listDataFiles(): Promise<DataFile[]> {
  const res = await fetch(`${BASE}/files`, { headers: { Authorization: `Bearer ${token()}` } });
  return handle(res);
}

export async function analyzeDataset(fileId: string): Promise<DatasetOverview> {
  const res = await fetch(`${BASE}/${encodeURIComponent(fileId)}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  return handle(res);
}

export interface AskHandlers {
  onStatus?: (stage: string) => void;
  onChunk: (text: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

/** Real Massive.com market dataset — dividend history + news sentiment, analyzed like a file. */
export async function analyzeMarketData(ticker: string): Promise<MarketDataset> {
  const res = await fetch(`${BASE}/market/${encodeURIComponent(ticker.trim().toUpperCase())}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  return handle(res);
}

/** Export URL for the market dataset — accepts the JWT via query like the file export. */
export function marketExportUrl(ticker: string, table: MarketTable): string {
  return `${BASE}/market/${encodeURIComponent(ticker.trim().toUpperCase())}/export.csv?table=${table}&token=${encodeURIComponent(token())}`;
}

/** Stream a natural-language question about a market dataset via SSE. */
export function askMarketData(
  ticker: string,
  question: string,
  handlers: AskHandlers
): { abort: () => void } {
  return askStream(
    `${BASE}/market/${encodeURIComponent(ticker.trim().toUpperCase())}/ask?q=${encodeURIComponent(question)}`,
    handlers
  );
}

/** Stream a natural-language question via SSE. Resolves when the stream ends or errors. */
export function askDataset(
  fileId: string,
  question: string,
  handlers: AskHandlers
): { abort: () => void } {
  return askStream(
    `${BASE}/${encodeURIComponent(fileId)}/ask?q=${encodeURIComponent(question)}`,
    handlers
  );
}

/** Shared SSE reader for the ask endpoints (file + market). */
function askStream(url: string, handlers: AskHandlers): { abort: () => void } {
  const controller = new AbortController();
  (async () => {
    const res = await fetch(url, {
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
      handlers.onStatus?.("failed");
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
            if (event === "chunk") handlers.onChunk(data.text || "");
            else if (event === "status") handlers.onStatus?.(data.stage);
            else if (event === "error") handlers.onError?.(data.message || "Analysis failed");
            else if (event === "done") handlers.onDone?.();
          }
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") handlers.onError?.(e?.message || "Connection lost");
      } finally {
        handlers.onDone?.();
      }
    };
    void read();
  })();

  return { abort: () => controller.abort() };
}

/** Export URL — the download endpoint accepts the JWT via query like other stream routes. */
export function datasetExportUrl(fileId: string): string {
  return `${BASE}/${encodeURIComponent(fileId)}/export.csv?token=${encodeURIComponent(token())}`;
}
