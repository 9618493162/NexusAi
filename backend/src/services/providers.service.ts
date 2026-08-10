import { env } from "../config/env";

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

async function checkResend(): Promise<ProviderStatus> {
  const configured = !!env.RESEND_API_KEY;
  if (!configured) return { id: "resend", name: "Resend", usedFor: "Verification emails", configured: false, status: "configured" };
  const { http, body } = await probe("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
  });
  if (http === 200) return { id: "resend", name: "Resend", usedFor: "Verification emails", configured: true, status: "ok", detail: "API key valid" };
  return { id: "resend", name: "Resend", usedFor: "Verification emails", configured: true, status: "invalid", detail: "API key is invalid (400)" };
}

export async function getProviderStatus(): Promise<ProviderStatus[]> {
  const results = await Promise.allSettled([
    checkGroq(),
    checkGemini(),
    checkOpenRouter(),
    checkApiframe(),
    checkFal(),
    checkPixazo(),
    checkResend(),
  ]);
  return results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { id: "unknown", name: "Provider", usedFor: "", configured: false, status: "configured" as const, detail: r.reason instanceof Error ? r.reason.message : "check failed" }
  );
}
