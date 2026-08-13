import { env } from "../config/env";
import { getAvailableModels } from "./chat.service";
import { getImageModels } from "./image.service";
import { getVideoModels } from "./video.service";
import { NVIDIA_MODELS, NVIDIA_MODEL_NAMES } from "./nvidia.service";
import { NVIDIA_IMAGE_FUNCTIONS, NVCF_BASE_URL } from "./nvidia-image.service";

interface ProviderStatus {
  id: string;
  name: string;
  usedFor: string;
  configured: boolean;
  status: "ok" | "low" | "no_credits" | "invalid" | "configured";
  detail?: string;
}

async function probe(url: string, options?: { headers?: Record<string, string>; maxBody?: number }): Promise<{ http: number; body: string }> {
  try {
    const res = await fetch(url, {
      headers: { ...(options?.headers || {}) },
      signal: AbortSignal.timeout(8000),
    });
    const body = await res.text().catch(() => "");
    return { http: res.status, body: body.slice(0, options?.maxBody ?? 300) };
  } catch (error) {
    return { http: 0, body: error instanceof Error ? error.message : "network error" };
  }
}

async function checkGroq(): Promise<ProviderStatus> {
  const configured = !!env.GROQ_API_KEY;
  if (!configured) return { id: "groq", name: "Groq", usedFor: "Chat (primary)", configured: false, status: "configured" };
  const { http } = await probe("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
  });
  if (http === 200) return { id: "groq", name: "Groq", usedFor: "Chat (primary)", configured: true, status: "ok", detail: "API key valid — ready" };
  return { id: "groq", name: "Groq", usedFor: "Chat (primary)", configured: true, status: "invalid", detail: `Key rejected (HTTP ${http})` };
}

async function checkGemini(): Promise<ProviderStatus> {
  const configured = !!env.GEMINI_API_KEY;
  if (!configured) return { id: "gemini", name: "Google Gemini", usedFor: "Chat", configured: false, status: "configured" };
  const { http } = await probe(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_API_KEY}`);
  if (http === 200) return { id: "gemini", name: "Google Gemini", usedFor: "Chat", configured: true, status: "ok", detail: "API key valid — gemini-flash-latest ready" };
  return { id: "gemini", name: "Google Gemini", usedFor: "Chat", configured: true, status: "invalid", detail: `Key rejected (HTTP ${http})` };
}

async function checkOpenRouter(): Promise<ProviderStatus> {
  const configured = !!env.OPENROUTER_API_KEY;
  if (!configured) return { id: "openrouter", name: "OpenRouter", usedFor: "Chat", configured: false, status: "configured" };
  const { http, body } = await probe("https://openrouter.ai/api/v1/credits", {
    headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
  });
  if (http === 200) {
    try {
      const d = JSON.parse(body);
      const credits = d.data?.total_credits ?? 0;
      if (credits <= 0) return { id: "openrouter", name: "OpenRouter", usedFor: "Chat", configured: true, status: "no_credits", detail: "Key valid but credit balance is $0" };
      return { id: "openrouter", name: "OpenRouter", usedFor: "Chat", configured: true, status: "ok", detail: `Key valid — $${credits.toFixed(2)} credit` };
    } catch {
      return { id: "openrouter", name: "OpenRouter", usedFor: "Chat", configured: true, status: "ok", detail: "Key valid" };
    }
  }
  return { id: "openrouter", name: "OpenRouter", usedFor: "Chat", configured: true, status: "invalid", detail: `Key rejected (HTTP ${http})` };
}

async function checkApiframe(): Promise<ProviderStatus> {
  const configured = !!env.APIFRAME_API_KEY;
  if (!configured) return { id: "apiframe", name: "APIFRAME", usedFor: "Image & video (primary)", configured: false, status: "configured" };
  const { http, body } = await probe("https://api.apiframe.ai/v2/me", {
    headers: { "X-API-Key": env.APIFRAME_API_KEY! },
    maxBody: 2000,
  });
  if (http === 200) {
    try {
      const d = JSON.parse(body);
      const team = d.team || {};
      const credits = team.credits ?? 0;
      if (credits <= 0) {
        return { id: "apiframe", name: "APIFRAME", usedFor: "Image & video (primary)", configured: true, status: "no_credits", detail: `Free plan — 0 credits (top up at apiframe.ai)` };
      }
      return { id: "apiframe", name: "APIFRAME", usedFor: "Image & video (primary)", configured: true, status: "ok", detail: `${credits} credits available` };
    } catch {
      return { id: "apiframe", name: "APIFRAME", usedFor: "Image & video (primary)", configured: true, status: "ok", detail: "Key valid" };
    }
  }
  return { id: "apiframe", name: "APIFRAME", usedFor: "Image & video (primary)", configured: true, status: "invalid", detail: `Key rejected (HTTP ${http})` };
}

async function checkFal(): Promise<ProviderStatus> {
  const configured = !!env.FAL_API_KEY;
  if (!configured) return { id: "fal", name: "fal.ai", usedFor: "Image & video (fallback)", configured: false, status: "configured" };
  // No free balance endpoint; last known state from generation attempts.
  return { id: "fal", name: "fal.ai", usedFor: "Image & video (fallback)", configured: true, status: "configured", detail: "Configured — balance checked at generation (was locked: exhausted balance)" };
}

async function checkPixazo(): Promise<ProviderStatus> {
  const configured = !!env.PIXAZO_API_KEY;
  if (!configured) return { id: "pixazo", name: "Pixazo.ai", usedFor: "Image (free FLUX Schnell)", configured: false, status: "configured" };
  // An empty body returns 400 "prompt is required" for a valid key and 401 for
  // an invalid one — a free, non-generating way to check validity.
  let http = 0;
  try {
    const res = await fetch("https://gateway.pixazo.ai/flux-1-schnell/v1/getData", {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": env.PIXAZO_API_KEY!, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(8000),
    });
    http = res.status;
  } catch { /* network error — http stays 0 */ }
  if (http === 400) return { id: "pixazo", name: "Pixazo.ai", usedFor: "Image (free FLUX Schnell)", configured: true, status: "ok", detail: "Key valid — free FLUX Schnell ready" };
  if (http === 401) return { id: "pixazo", name: "Pixazo.ai", usedFor: "Image (free FLUX Schnell)", configured: true, status: "invalid", detail: "Key rejected (401)" };
  return { id: "pixazo", name: "Pixazo.ai", usedFor: "Image (free FLUX Schnell)", configured: true, status: "invalid", detail: `Probe failed (HTTP ${http})` };
}

async function checkNvidia(): Promise<ProviderStatus> {
  const configured = !!env.NVIDIA_NIM_API_KEY;
  if (!configured) {
    return { id: "nvidia", name: "NVIDIA NIM", usedFor: "Chat & image", configured: false, status: "configured" };
  }
  const { http } = await probe("https://integrate.api.nvidia.com/v1/models", {
    headers: { Authorization: `Bearer ${env.NVIDIA_NIM_API_KEY}` },
  });
  if (http === 200) {
    return { id: "nvidia", name: "NVIDIA NIM", usedFor: "Chat & image", configured: true, status: "ok", detail: "API key valid — serverless models ready" };
  }
  return { id: "nvidia", name: "NVIDIA NIM", usedFor: "Chat & image", configured: true, status: "invalid", detail: `Key rejected (HTTP ${http})` };
}

async function checkKimi(): Promise<ProviderStatus> {
  const configured = !!env.KIMI_API_KEY;
  if (!configured) return { id: "kimi", name: "Kimi (Moonshot)", usedFor: "Chat", configured: false, status: "configured" };
  const { http } = await probe("https://api.moonshot.ai/v1/models", {
    headers: { Authorization: `Bearer ${env.KIMI_API_KEY}` },
  });
  if (http !== 200) {
    return { id: "kimi", name: "Kimi (Moonshot)", usedFor: "Chat", configured: true, status: "invalid", detail: `Key rejected (HTTP ${http})` };
  }
  // No free balance endpoint — probe a 1-token completion to detect whether
  // the account is out of balance (key is valid either way).
  try {
    const res = await fetch("https://api.moonshot.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.KIMI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "kimi-k2.6", messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
      signal: AbortSignal.timeout(8000),
    });
    const body = await res.text().catch(() => "");
    if (/insufficient balance|suspended|recharge/i.test(body)) {
      return { id: "kimi", name: "Kimi (Moonshot)", usedFor: "Chat", configured: true, status: "no_credits", detail: "Key valid but account balance is $0 (top up at platform.moonshot.ai)" };
    }
    return { id: "kimi", name: "Kimi (Moonshot)", usedFor: "Chat", configured: true, status: "ok", detail: "API key valid — kimi-k2.6 ready" };
  } catch {
    return { id: "kimi", name: "Kimi (Moonshot)", usedFor: "Chat", configured: true, status: "ok", detail: "API key valid" };
  }
}

async function checkTinyFish(): Promise<ProviderStatus> {
  const configured = !!env.TINYFISH_API_KEY;
  if (!configured) return { id: "tinyfish", name: "TinyFish", usedFor: "Web search (chat)", configured: false, status: "configured" };
  const { http } = await probe("https://api.search.tinyfish.ai?query=test", {
    headers: { "X-API-Key": env.TINYFISH_API_KEY! },
    maxBody: 200,
  });
  if (http === 200) return { id: "tinyfish", name: "TinyFish", usedFor: "Web search (chat)", configured: true, status: "ok", detail: "Key valid — free Search API ready" };
  return { id: "tinyfish", name: "TinyFish", usedFor: "Web search (chat)", configured: true, status: "invalid", detail: `Key rejected (HTTP ${http})` };
}

async function checkResend(): Promise<ProviderStatus> {
  const configured = !!env.RESEND_API_KEY;
  if (!configured) return { id: "resend", name: "Resend", usedFor: "Verification emails", configured: false, status: "configured" };
  const { http, body } = await probe("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
  });
  if (http === 200) return { id: "resend", name: "Resend", usedFor: "Verification emails", configured: true, status: "ok", detail: "API key valid" };
  return { id: "resend", name: "Resend", usedFor: "Verification emails", configured: true, status: "invalid", detail: `API key rejected (HTTP ${http})` };
}

export interface CatalogModel {
  id: string;
  name: string;
  provider: string;
  context?: string;
  capabilities: string[];
}

/** Chat models whose id/name marks them as code-specialized. */
const CODE_MODEL_PATTERN = /codestral|kimi-k2\.7|deepseek.*coder|qwen.*coder/i;

/**
 * Map a model id/name to the provider that serves it. Chat models already
 * carry a provider; image/video model lists do not, so infer from the id
 * conventions used by the backend's own model constants.
 */
function inferProvider(id: string, name: string): string {
  if (id.startsWith("gemini-") || /google|gemini/i.test(name)) return "gemini";
  if (id.startsWith("pixazo/") || /pixazo/i.test(name)) return "pixazo";
  if (id.startsWith("nvidia/") || /nvidia/i.test(name)) return "nvidia";
  if (id.startsWith("fal-ai/") || /\bfal\.ai/i.test(name)) return "fal";
  if (id.startsWith("json2video")) return "json2video";
  if (id.startsWith("apiframe") || /apiframe/i.test(name)) return "apiframe";
  // apiframe image/video catalog ids (FLUX, Seedream, Kling, Sora, ...)
  if (/^(flux|seedream|nano-banana|gpt-image|imagen|ideogram|kling|midjourney|sora|seedance|runway|hailuo|luma|wan|veo)/i.test(id)) {
    return "apiframe";
  }
  return "unknown";
}

/**
 * One catalog of every model the backend can actually use, annotated with its
 * provider and capabilities. Combines the same getters the generation routes
 * use, so the UI can never show a model the backend can't serve. Capabilities
 * are conservative: TEXT/DOCUMENT for every chat model (file analysis reuses
 * the chat API), CODE only for code-specialized ids, and the generation
 * category for image/video models.
 */
export async function getModelCatalog(): Promise<{ models: { chat: CatalogModel[]; image: CatalogModel[]; video: CatalogModel[] } }> {
  const [chatModels, imageModels, videoModels] = await Promise.all([
    getAvailableModels(),
    getImageModels(),
    getVideoModels(),
  ]);

  const chat: CatalogModel[] = chatModels.map((m) => ({
    id: m.id,
    name: m.name,
    provider: (m as { provider?: string }).provider || inferProvider(m.id, m.name),
    context: (m as { context?: string }).context,
    capabilities: ["TEXT", "DOCUMENT", ...(CODE_MODEL_PATTERN.test(m.id) ? ["CODE"] : [])],
  }));

  const image: CatalogModel[] = imageModels.map((m) => ({
    id: m.id,
    name: m.name,
    provider: inferProvider(m.id, m.name),
    capabilities: ["IMAGE"],
  }));

  const video: CatalogModel[] = videoModels.map((m) => ({
    id: m.id,
    name: m.name,
    provider: inferProvider(m.id, m.name),
    capabilities: ["VIDEO"],
  }));

  return { models: { chat, image, video } };
}

export async function getProviderStatus(): Promise<ProviderStatus[]> {
  const results = await Promise.allSettled([
    checkGroq(),
    checkGemini(),
    checkOpenRouter(),
    checkNvidia(),
    checkApiframe(),
    checkFal(),
    checkPixazo(),
    checkKimi(),
    checkTinyFish(),
    checkResend(),
  ]);
  return results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { id: "unknown", name: "Provider", usedFor: "", configured: false, status: "configured" as const, detail: r.reason instanceof Error ? r.reason.message : "check failed" }
  );
}

/* ------------------------------------------------------------------ */
/* NVIDIA per-model health — pings every chat model + NVCF image       */
/* function with a 1-token probe (8s budget each, run in parallel).    */
/* ------------------------------------------------------------------ */

export interface NvidiaModelHealth {
  id: string;
  name: string;
  kind: "chat" | "image";
  status: "ok" | "cold" | "error";
  latencyMs?: number;
  detail: string;
}

export interface NvidiaHealth {
  chat: NvidiaModelHealth[];
  image: NvidiaModelHealth[];
}

const NVIDIA_PROBE_TIMEOUT_MS = 8000;

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

/** Probe one NVIDIA serverless chat model with a 1-token completion. */
async function probeNvidiaChatModel(id: string, name: string): Promise<NvidiaModelHealth> {
  const started = Date.now();
  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.NVIDIA_NIM_API_KEY}`,
      },
      body: JSON.stringify({ model: id, messages: [{ role: "user", content: "hi" }], max_tokens: 1, stream: false }),
      signal: AbortSignal.timeout(NVIDIA_PROBE_TIMEOUT_MS),
    });
    const latencyMs = Date.now() - started;
    if (res.ok) return { id, name, kind: "chat", status: "ok", latencyMs, detail: "Ready — responds instantly" };
    return { id, name, kind: "chat", status: "error", latencyMs, detail: `HTTP ${res.status}` };
  } catch (error) {
    const latencyMs = Date.now() - started;
    if (isTimeout(error)) {
      return { id, name, kind: "chat", status: "cold", latencyMs, detail: "Cold start — first real use warms it (~1 min)" };
    }
    return { id, name, kind: "chat", status: "error", latencyMs, detail: error instanceof Error ? error.message : "network error" };
  }
}

/** Probe one NVIDIA NVCF image function with a minimal synchronous job. */
async function probeNvidiaImageFunction(functionId: string, name: string, modelId: string): Promise<NvidiaModelHealth> {
  const started = Date.now();
  const key = env.NVIDIA_IMAGE_API_KEY || env.NVIDIA_NIM_API_KEY || "";
  try {
    const res = await fetch(`${NVCF_BASE_URL}/pexec/functions/${functionId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ prompt: "a tiny red circle", seed: 42 }),
      signal: AbortSignal.timeout(NVIDIA_PROBE_TIMEOUT_MS),
    });
    const latencyMs = Date.now() - started;
    if (res.status === 200) return { id: modelId, name, kind: "image", status: "ok", latencyMs, detail: "Ready — generates instantly" };
    if (res.status === 202) return { id: modelId, name, kind: "image", status: "ok", latencyMs, detail: "Ready — job queued (async)" };
    return { id: modelId, name, kind: "image", status: "error", latencyMs, detail: `HTTP ${res.status}` };
  } catch (error) {
    const latencyMs = Date.now() - started;
    if (isTimeout(error)) return { id: modelId, name, kind: "image", status: "cold", latencyMs, detail: "Function warming up — try again in a moment" };
    return { id: modelId, name, kind: "image", status: "error", latencyMs, detail: error instanceof Error ? error.message : "network error" };
  }
}

export async function getNvidiaHealth(): Promise<NvidiaHealth> {
  const chatEntries = Object.entries(NVIDIA_MODELS).map(([, id]) => ({
    id,
    name: NVIDIA_MODEL_NAMES[id] ?? id,
  }));
  const imageEntries = Object.entries(NVIDIA_IMAGE_FUNCTIONS).map(([modelId, v]) => ({
    functionId: v.id,
    name: v.name,
    modelId,
  }));

  const [chat, image] = await Promise.all([
    Promise.all(chatEntries.map((m) => probeNvidiaChatModel(m.id, m.name))),
    Promise.all(imageEntries.map((f) => probeNvidiaImageFunction(f.functionId, f.name, f.modelId))),
  ]);

  return { chat, image };
}
