import { prisma } from "../config/database";
import { streamChat } from "./chat.service";
import { searchWeb, formatSearchResults } from "./search.service";
import { findRelevantFiles } from "./research.service";
import { logger } from "../config/logger";

/**
 * AI Agents Studio.
 *
 * Agents are user-defined system prompts + a model, optionally granted REAL
 * tools that wire into existing services:
 *  - web:  the TinyFish-backed `searchWeb` already used by chat + research
 *  - files: the user's own uploaded files (ownership-scoped retrieval, same
 *           matching the research engine uses)
 *
 * Execution streams the real AI answer through the existing chat pipeline
 * (with the same provider fallback chain), and every run is persisted with
 * the actual tool context that was collected. Nothing is faked.
 */

export interface AgentTools {
  web?: boolean;
  files?: boolean;
}

export interface AgentRunEvent {
  type: "status" | "tool" | "chunk" | "done" | "error";
  stage?: string;
  tool?: string;
  count?: number;
  text?: string;
  output?: string;
  runId?: string;
  sources?: Array<{ kind: string; title: string; url?: string | null; snippet: string }>;
  message?: string;
}

/** Try providers in order — an agent run must survive a single provider outage. */
async function* streamWithFallback(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  userId: string
): AsyncGenerator<string, void, unknown> {
  const candidates = ["gemini-flash-latest", "llama-3.3-70b-versatile", "qwen/qwen3.6-27b"];
  let lastError: unknown = null;
  for (const model of candidates) {
    try {
      yield* streamChat(messages, model, userId, "agents");
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("All AI providers failed.");
}

function buildUserMessage(
  input: string,
  tools: { web?: boolean; files?: boolean },
  webContext: string,
  fileSources: Array<{ title: string; snippet: string }>
): string {
  const parts: string[] = [];
  parts.push(`Task:\n${input}`);
  if (webContext) {
    parts.push(
      `Context from your web tool (real search results — use them when relevant and cite source URLs):\n${webContext}`
    );
  }
  if (fileSources.length > 0) {
    parts.push(
      `Context from your files tool (the user's own files — ownership-scoped, never another user's data):\n` +
        fileSources
          .map((f, i) => `[${i + 1}] FILE: ${f.title}\n    ${f.snippet.slice(0, 600)}`)
          .join("\n")
    );
  } else if (tools.files) {
    // The tool ran and searched the user's library — say so, so the model
    // reports an honest "no matching files" instead of guessing files exist.
    parts.push(
      "Your files tool searched the user's uploaded-file library and found no documents matching this task."
    );
  }
  if (webContext || fileSources.length > 0 || tools.files) {
    parts.push(
      "Rules: use the provided context when it is relevant, and never invent sources, URLs or facts. " +
        "If the context does not answer the task, say so plainly instead of guessing."
    );
  }
  return parts.join("\n\n");
}

export async function runAgent(
  userId: string,
  agentId: string,
  input: string,
  onEvent: (event: AgentRunEvent) => void
): Promise<void> {
  const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
  if (!agent) throw new Error("Agent not found");

  const tools = (agent.tools as AgentTools) || {};
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Enter a task for this agent.");

  onEvent({ type: "status", stage: "starting" });

  const run = await prisma.agentRun.create({
    data: { agentId: agent.id, userId, input: trimmed.slice(0, 10000), status: "running" },
  });

  const sources: Array<{ kind: string; title: string; url?: string | null; snippet: string }> = [];
  const started = Date.now();
  let webContext = "";

  // 1. Real tool collection — only the tools the agent was granted.
  if (tools.web) {
    onEvent({ type: "tool", tool: "web" });
    const results = await searchWeb(trimmed, { maxResults: 6 });
    webContext = formatSearchResults(trimmed, results);
    for (const r of results) {
      sources.push({ kind: "web", title: r.title || r.url, url: r.url, snippet: r.snippet || "" });
    }
  }

  let fileSources: Array<{ title: string; snippet: string }> = [];
  if (tools.files) {
    onEvent({ type: "tool", tool: "files" });
    const files = await findRelevantFiles(userId, trimmed);
    fileSources = files.map((f) => ({ title: f.title, snippet: f.snippet }));
    for (const f of files) {
      sources.push({ kind: "file", title: f.title, snippet: f.snippet });
    }
  }

  onEvent({ type: "status", stage: "writing", count: sources.length });

  // 2. Real AI answer through the existing chat pipeline.
  const messages = [
    {
      role: "system" as const,
      content:
        agent.systemPrompt ||
        "You are a capable NexusAI agent. Complete the user's task accurately and concisely.",
    },
    { role: "user" as const, content: buildUserMessage(trimmed, tools, webContext, fileSources) },
  ];

  let full = "";
  try {
    for await (const chunk of streamWithFallback(messages, userId)) {
      full += chunk;
      onEvent({ type: "chunk", text: chunk });
    }
  } catch (error: any) {
    const message = error?.message || "Agent run failed";
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "failed", error: message.slice(0, 500), durationMs: Date.now() - started },
    });
    onEvent({ type: "error", message });
    return;
  }

  const output = full.trim();
  if (!output) {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "failed", error: "The agent returned an empty answer. Please try again.", durationMs: Date.now() - started },
    });
    onEvent({ type: "error", message: "The agent returned an empty answer. Please try again." });
    return;
  }

  await prisma.agentRun.update({
    where: { id: run.id },
    data: { status: "completed", output, sources, durationMs: Date.now() - started },
  });

  onEvent({ type: "done", runId: run.id, output, sources });
}

/* ---------- CRUD (ownership-scoped) ---------- */

export interface AgentInput {
  name: string;
  description?: string;
  systemPrompt?: string;
  model?: string;
  tools?: string[];
}

export async function listAgents(userId: string) {
  return prisma.agent.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { runs: true } },
      runs: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, createdAt: true } },
    },
  });
}

export async function getAgent(userId: string, id: string) {
  return prisma.agent.findFirst({ where: { id, userId } });
}

export async function createAgent(userId: string, data: AgentInput) {
  const name = (data.name || "").trim().slice(0, 120);
  if (!name) throw new Error("Agent name is required");
  const tools = Array.isArray(data.tools) ? data.tools.filter((t) => t === "web" || t === "files") : [];
  return prisma.agent.create({
    data: {
      name,
      description: (data.description || "").trim().slice(0, 300) || null,
      systemPrompt: (data.systemPrompt || "").trim().slice(0, 8000),
      model: (data.model || "").trim().slice(0, 200) || "gemini-flash-latest",
      tools: { web: tools.includes("web"), files: tools.includes("files") },
      userId,
    },
  });
}

export async function updateAgent(userId: string, id: string, data: Partial<AgentInput>) {
  const existing = await prisma.agent.findFirst({ where: { id, userId } });
  if (!existing) return null;
  const tools = Array.isArray(data.tools)
    ? { web: data.tools.includes("web"), files: data.tools.includes("files") }
    : undefined;
  return prisma.agent.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim().slice(0, 120) } : {}),
      ...(data.description !== undefined ? { description: data.description.trim().slice(0, 300) || null } : {}),
      ...(data.systemPrompt !== undefined ? { systemPrompt: data.systemPrompt.trim().slice(0, 8000) } : {}),
      ...(data.model !== undefined ? { model: data.model.trim().slice(0, 200) } : {}),
      ...(tools ? { tools } : {}),
    },
  });
}

export async function deleteAgent(userId: string, id: string) {
  const existing = await prisma.agent.findFirst({ where: { id, userId } });
  if (!existing) return null;
  return prisma.agent.delete({ where: { id } });
}

export async function listAgentRuns(userId: string, agentId: string) {
  const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
  if (!agent) return null;
  return prisma.agentRun.findMany({
    where: { agentId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

export async function getAgentRun(userId: string, id: string) {
  return prisma.agentRun.findFirst({ where: { id, userId } });
}

export async function logAgentError(err: unknown): Promise<void> {
  logger.error("Agent run error:", err);
}
