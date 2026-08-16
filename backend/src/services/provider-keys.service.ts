import { prisma } from "../config/database";
import { env } from "../config/env";
import { encryptSecret, decryptSecret } from "./encryption.service";

/**
 * Bring-Your-Own-Key: user-owned provider credentials, encrypted at rest and
 * decrypted only in memory for a single provider call. The plaintext key
 * never appears in any API response, log, or client payload.
 */

export type ByokProvider = "groq" | "gemini" | "openrouter" | "mistral" | "kimi" | "nvidia" | "grid";

export interface ProviderTestResult {
  provider: ByokProvider;
  status: "connected" | "invalid" | "no_credits" | "rate_limited" | "unavailable";
  detail?: string;
}

export interface ProviderKeyRow {
  provider: ByokProvider;
  name: string;
  usedFor: string;
  serverConfigured: boolean;
  hasUserKey: boolean;
  keyHint?: string;
  label?: string | null;
  status: string;
  lastUsedAt?: string | null;
  usageCount: number; // real provider requests through the user's key
  totalTokens: number; // real output tokens streamed through the user's key
}

/**
 * Default model id per provider — used when "Auto" routes to a provider
 * (the user's default or a feature's preferred provider). Concrete ids only:
 * the gemini "-latest" alias is deliberately avoided because it stalls the
 * SSE stream on some Node runtimes.
 */
const PROVIDER_DEFAULT_MODELS: Record<ByokProvider, string> = {
  groq: "llama-3.3-70b-versatile",
  gemini: "gemini-3.5-flash",
  openrouter: "openai/gpt-4o",
  mistral: "mistral-large-latest",
  kimi: "kimi-k2.6",
  nvidia: "nvidia/llama-3.3-nemotron-super-49b-v1",
  grid: "grid-auto",
};

/** Whether the server holds a key for a provider (env vars, never exposed). */
const SERVER_KEYS: Record<ByokProvider, boolean> = {
  groq: !!env.GROQ_API_KEY,
  gemini: !!env.GEMINI_API_KEY,
  openrouter: !!env.OPENROUTER_API_KEY,
  mistral: !!env.MISTRAL_API_KEY,
  kimi: !!env.KIMI_API_KEY,
  nvidia: !!env.NVIDIA_NIM_API_KEY,
  grid: !!env.GRID_API_KEY,
};

/** Features that can be pinned to a specific provider ("Auto" routing). */
export const AI_FEATURES: Array<{ id: string; label: string }> = [
  { id: "chat", label: "Chat" },
  { id: "file-analysis", label: "File analysis" },
  { id: "research", label: "Research" },
  { id: "data-analysis", label: "Data analysis" },
  { id: "documents", label: "Documents & reports" },
  { id: "meetings", label: "Meeting summaries" },
  { id: "agents", label: "Agents" },
];

/** A provider is usable when the server key exists OR the user brought one. */
export async function hasProviderCredential(userId: string | undefined, provider: ByokProvider): Promise<boolean> {
  if (SERVER_KEYS[provider]) return true;
  if (!userId) return false;
  const row = await prisma.providerKey.findUnique({
    where: { userId_provider: { userId, provider } },
    select: { id: true },
  });
  return !!row;
}

/** Per-feature provider preferences (feature id -> provider), stored on User. */
export async function getFeatureProviders(userId: string): Promise<Record<string, ByokProvider>> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { featureProviders: true } });
  const raw = (user?.featureProviders ?? {}) as Record<string, string>;
  const out: Record<string, ByokProvider> = {};
  for (const [feature, provider] of Object.entries(raw)) {
    if (isByokProvider(provider)) out[feature] = provider;
  }
  return out;
}

export async function setFeatureProvider(
  userId: string,
  feature: string,
  provider: ByokProvider | null
): Promise<Record<string, ByokProvider>> {
  const prefs = await getFeatureProviders(userId);
  if (provider === null) delete prefs[feature];
  else prefs[feature] = provider;
  await prisma.user.update({ where: { id: userId }, data: { featureProviders: prefs } });
  return prefs;
}

/**
 * Resolve what "Auto" means for a request: the feature's preferred provider,
 * then the user's default provider, then a safe fallback. Only providers the
 * user can actually reach (own key or server key) are ever chosen.
 */
export async function resolveAutoModel(
  userId: string | undefined,
  feature: string = "chat"
): Promise<{ model: string; provider: ByokProvider }> {
  if (userId) {
    const prefs = await getFeatureProviders(userId);
    const featured = prefs[feature];
    if (featured && (await hasProviderCredential(userId, featured))) {
      return { model: PROVIDER_DEFAULT_MODELS[featured], provider: featured };
    }
    const def = await getDefaultProvider(userId);
    if (def && isByokProvider(def) && (await hasProviderCredential(userId, def))) {
      return { model: PROVIDER_DEFAULT_MODELS[def], provider: def };
    }
  }
  if (await hasProviderCredential(userId, "gemini")) {
    return { model: PROVIDER_DEFAULT_MODELS.gemini, provider: "gemini" };
  }
  return { model: PROVIDER_DEFAULT_MODELS.groq, provider: "groq" };
}

/** Record real output-token usage against the user's key (best-effort). */
export async function recordKeyUsage(userId: string, provider: ByokProvider, tokens: number): Promise<void> {
  await prisma.providerKey
    .updateMany({
      where: { userId, provider },
      data: { totalTokens: { increment: Math.max(0, Math.round(tokens)) } },
    })
    .catch(() => {});
}

export const BYOK_PROVIDERS: Array<{
  id: ByokProvider;
  name: string;
  usedFor: string;
  serverConfigured: boolean;
}> = [
  { id: "groq", name: "Groq", usedFor: "Chat (primary)", serverConfigured: !!env.GROQ_API_KEY },
  { id: "gemini", name: "Google Gemini", usedFor: "Chat & file analysis", serverConfigured: !!env.GEMINI_API_KEY },
  { id: "openrouter", name: "OpenRouter", usedFor: "Chat", serverConfigured: !!env.OPENROUTER_API_KEY },
  { id: "mistral", name: "Mistral", usedFor: "Chat", serverConfigured: !!env.MISTRAL_API_KEY },
  { id: "kimi", name: "Kimi (Moonshot)", usedFor: "Chat", serverConfigured: !!env.KIMI_API_KEY },
  { id: "nvidia", name: "NVIDIA NIM", usedFor: "Chat", serverConfigured: !!env.NVIDIA_NIM_API_KEY },
  { id: "grid", name: "AI Power Grid", usedFor: "Chat (fallback)", serverConfigured: !!env.GRID_API_KEY },
];

const openAiCompatProbe = async (
  url: string,
  apiKey: string,
  extraHeaders?: Record<string, string>
): Promise<{ http: number; body: string }> => {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, ...(extraHeaders || {}) },
      signal: AbortSignal.timeout(8000),
    });
    const body = await res.text().catch(() => "");
    return { http: res.status, body: body.slice(0, 300) };
  } catch {
    return { http: 0, body: "network error" };
  }
};

/**
 * Real, minimal authenticated probe against the provider. Returns a category
 * (never the provider's raw secret). A 200 (or a 400 that only an
 * authenticated key can reach) means the key is valid.
 */
export async function testProviderKey(provider: ByokProvider, apiKey: string): Promise<ProviderTestResult> {
  const base: ProviderTestResult = { provider, status: "unavailable" };

  const map = (http: number, body: string, opts?: { credits?: number }): ProviderTestResult => {
    if (opts?.credits !== undefined) {
      if (opts.credits <= 0) return { ...base, status: "no_credits", detail: "Key valid but credit balance is $0" };
      return { ...base, status: "connected", detail: `Key valid — $${opts.credits.toFixed(2)} credit` };
    }
    if (http === 200) return { ...base, status: "connected", detail: "Key valid — connected" };
    if (http === 400) {
      // Gemini rejects bad keys with 400; a prompt-less 400 from Pixazo-style
      // endpoints is not used here, so 400 means the key itself was rejected.
      return { ...base, status: "invalid", detail: "Key rejected by provider (HTTP 400)" };
    }
    if (http === 401 || http === 403) return { ...base, status: "invalid", detail: `Key rejected (HTTP ${http})` };
    if (http === 402) return { ...base, status: "no_credits", detail: "Key valid but out of credits (HTTP 402)" };
    if (http === 429) return { ...base, status: "rate_limited", detail: "Rate limited — try again in a moment (HTTP 429)" };
    if (http === 0) return { ...base, status: "unavailable", detail: "Provider unreachable — check your connection" };
    return { ...base, status: "unavailable", detail: `Provider responded unexpectedly (HTTP ${http})` };
  };

  switch (provider) {
    case "groq": {
      const { http, body } = await openAiCompatProbe("https://api.groq.com/openai/v1/models", apiKey);
      return map(http, body);
    }
    case "gemini": {
      // Gemini takes the key as a query param; the Authorization header is
      // harmless and satisfies the probe signature.
      const { http, body } = await openAiCompatProbe(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        apiKey
      );
      return map(http, body);
    }
    case "openrouter": {
      const { http, body } = await openAiCompatProbe("https://openrouter.ai/api/v1/credits", apiKey);
      if (http === 200) {
        try {
          const credits = JSON.parse(body).data?.total_credits ?? 0;
          return map(200, body, { credits });
        } catch {
          return map(200, body);
        }
      }
      return map(http, body);
    }
    case "mistral": {
      const { http, body } = await openAiCompatProbe("https://api.mistral.ai/v1/models", apiKey);
      return map(http, body);
    }
    case "kimi": {
      const { http, body } = await openAiCompatProbe("https://api.moonshot.ai/v1/models", apiKey);
      return map(http, body);
    }
    case "nvidia": {
      const { http, body } = await openAiCompatProbe("https://integrate.api.nvidia.com/v1/models", apiKey);
      return map(http, body);
    }
    case "grid": {
      // /v1/models is public on the Grid, so validate with a real 1-token
      // completion: 200 = valid, 401 = rejected, 503 = no workers online.
      try {
        const res = await fetch("https://api.aipowergrid.io/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: "gpt-oss-120b", messages: [{ role: "user", content: "hi" }], max_tokens: 1, stream: false }),
          signal: AbortSignal.timeout(8000),
        });
        if (res.status === 200) return { ...base, status: "connected", detail: "Key valid — free streaming ready" };
        if (res.status === 503) return { ...base, status: "unavailable", detail: "Key valid but no GPU workers online right now (503)" };
        return map(res.status, "");
      } catch {
        return { ...base, status: "unavailable", detail: "Provider unreachable — check your connection" };
      }
    }
  }
}

/** Every BYOK provider row for the user: masked user key + server key state. */
export async function listProviderKeys(userId: string): Promise<ProviderKeyRow[]> {
  const [userKeys, user] = await Promise.all([
    prisma.providerKey.findMany({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { defaultChatProvider: true } }),
  ]);
  const byProvider = new Map(userKeys.map((k) => [k.provider, k]));
  return BYOK_PROVIDERS.map((p) => {
    const k = byProvider.get(p.id);
    return {
      provider: p.id,
      name: p.name,
      usedFor: p.usedFor,
      serverConfigured: p.serverConfigured,
      hasUserKey: !!k,
      keyHint: k?.keyHint,
      label: k?.label,
      status: k?.status ?? "none",
      lastUsedAt: k?.lastUsedAt?.toISOString() ?? null,
      usageCount: k?.usageCount ?? 0,
      totalTokens: k?.totalTokens ?? 0,
    };
  });
}

/** Default provider the user picked (null = automatic). */
export async function getDefaultProvider(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { defaultChatProvider: true } });
  return user?.defaultChatProvider ?? null;
}

export async function setDefaultProvider(userId: string, provider: ByokProvider | null): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { defaultChatProvider: provider } });
}

/**
 * Save (or replace) the user's key for a provider. The key is tested first —
 * an invalid key is rejected with a clear reason and never stored — then
 * encrypted at rest. Returns the masked row.
 */
export async function saveProviderKey(
  userId: string,
  provider: ByokProvider,
  apiKey: string,
  label?: string
): Promise<ProviderKeyRow> {
  const test = await testProviderKey(provider, apiKey.trim());
  if (test.status === "invalid") throw new Error(`That ${provider} key was rejected (${test.detail}).`);
  if (test.status === "unavailable") throw new Error(`Couldn't reach ${provider} to verify the key — ${test.detail}`);
  if (test.status === "rate_limited") throw new Error(`Rate limited while testing — ${test.detail}`);

  const encryptedKey = encryptSecret(apiKey.trim());
  const keyHint = apiKey.trim().slice(-4);
  await prisma.providerKey.upsert({
    where: { userId_provider: { userId, provider } },
    create: { userId, provider, encryptedKey, keyHint, label: label?.trim() || null },
    update: { encryptedKey, keyHint, label: label?.trim() || null, status: "active" },
  });
  return (await listProviderKeys(userId)).find((r) => r.provider === provider)!;
}

export async function deleteProviderKey(userId: string, provider: ByokProvider): Promise<void> {
  await prisma.providerKey.deleteMany({ where: { userId, provider } });
}

/**
 * Resolve the effective key for a provider call: the user's own decrypted key
 * when present, otherwise null (callers fall back to the server env key). The
 * plaintext exists only for the duration of the call and is never logged.
 */
export async function resolveProviderKey(userId: string | undefined, provider: ByokProvider): Promise<string | null> {
  if (!userId) return null;
  const row = await prisma.providerKey.findUnique({ where: { userId_provider: { userId, provider } } });
  if (!row) return null;
  const key = decryptSecret(row.encryptedKey);
  // Touch lastUsedAt + the request counter without blocking the call.
  prisma.providerKey
    .updateMany({ where: { id: row.id }, data: { lastUsedAt: new Date(), usageCount: { increment: 1 } } })
    .catch(() => {});
  return key;
}

export function isByokProvider(value: string): value is ByokProvider {
  return BYOK_PROVIDERS.some((p) => p.id === value);
}
