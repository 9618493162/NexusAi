import { useAuthStore } from "@/store/auth.store";

export interface AgentTools {
  web?: boolean;
  files?: boolean;
}

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  model: string;
  tools: AgentTools;
  userId: string;
  createdAt: string;
  updatedAt: string;
  _count?: { runs: number };
  runs?: Array<{ id: string; status: string; createdAt: string }>;
}

export interface AgentSource {
  kind: "web" | "file";
  title: string;
  url?: string | null;
  snippet: string;
}

export interface AgentRun {
  id: string;
  agentId: string;
  input: string;
  output: string | null;
  status: "pending" | "running" | "completed" | "failed";
  error: string | null;
  sources: AgentSource[] | null;
  durationMs: number | null;
  createdAt: string;
}

const BASE = `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/agents`;

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

export async function listAgents(): Promise<Agent[]> {
  const res = await fetch(`${BASE}/`, { headers: { Authorization: `Bearer ${token()}` } });
  const data = await handle(res);
  return data.agents || [];
}

export async function getAgent(id: string): Promise<Agent> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  return handle(res);
}

export interface AgentInput {
  name: string;
  description?: string;
  systemPrompt?: string;
  model?: string;
  tools?: string[];
}

export async function createAgent(data: AgentInput): Promise<Agent> {
  const res = await fetch(`${BASE}/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function updateAgent(id: string, data: AgentInput): Promise<Agent> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function deleteAgent(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token()}` },
  });
  await handle(res);
}

export async function listAgentRuns(agentId: string): Promise<AgentRun[]> {
  const res = await fetch(`${BASE}/${encodeURIComponent(agentId)}/runs`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  const data = await handle(res);
  return data.runs || [];
}

export interface RunHandlers {
  onStage?: (stage: string, count?: number) => void;
  onTool?: (tool: string) => void;
  onChunk?: (text: string) => void;
  onDone?: (output: string, sources: AgentSource[], runId: string) => void;
  onError?: (message: string) => void;
}

/** Run an agent, streaming real tool events + AI output over SSE. */
export function runAgent(
  id: string,
  input: string,
  handlers: RunHandlers
): { abort: () => void } {
  const controller = new AbortController();
  (async () => {
    const res = await fetch(`${BASE}/${encodeURIComponent(id)}/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
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
            if (event === "status") handlers.onStage?.(data.stage, data.count);
            else if (event === "tool") handlers.onTool?.(data.tool || "");
            else if (event === "chunk") handlers.onChunk?.(data.text || "");
            else if (event === "done") handlers.onDone?.(data.output || "", data.sources || [], data.runId || "");
            else if (event === "error") handlers.onError?.(data.message || "Agent run failed");
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
