import { api } from "./api";

export interface ProviderStatus {
  id: string;
  name: string;
  usedFor: string;
  configured: boolean;
  status: "ok" | "low" | "no_credits" | "invalid" | "configured";
  detail?: string;
}

export interface CatalogModel {
  id: string;
  name: string;
  provider: string;
  context?: string;
  capabilities: string[];
}

export interface ModelCatalog {
  models: { chat: CatalogModel[]; image: CatalogModel[]; video: CatalogModel[] };
  providers: ProviderStatus[];
}

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

// ---------------------------------------------------------------------------
// Bring-Your-Own-Key — user-owned provider credentials (encrypted server-side)
// ---------------------------------------------------------------------------

export type ByokProvider = "groq" | "gemini" | "openrouter" | "mistral" | "kimi" | "nvidia" | "grid";

export interface ByokProviderMeta {
  id: ByokProvider;
  name: string;
  usedFor: string;
  serverConfigured: boolean;
}

export interface ByokKeyRow {
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

export interface ByokKeysResponse {
  providers: ByokProviderMeta[];
  keys: ByokKeyRow[];
  defaultProvider: string | null;
  featureProviders?: Record<string, ByokProvider>;
  features?: Array<{ id: string; label: string }>;
}

export interface ByokTestResult {
  provider: ByokProvider;
  status: "connected" | "invalid" | "no_credits" | "rate_limited" | "unavailable";
  detail?: string;
}

export const providersService = {
  getStatus: () => api.get<{ providers: ProviderStatus[] }>("/providers/status"),
  getModelCatalog: () => api.get<ModelCatalog>("/providers/models"),
  getNvidiaHealth: () => api.get<NvidiaHealth>("/providers/nvidia/health"),

  // BYOK
  getKeys: () => api.get<ByokKeysResponse>("/providers/keys"),
  addKey: (provider: ByokProvider, apiKey: string, label?: string) =>
    api.post<{ key: ByokKeyRow }>("/providers/keys", { provider, apiKey, label }),
  testKey: (provider: ByokProvider, apiKey?: string) =>
    api.post<ByokTestResult>("/providers/keys/test", { provider, apiKey }),
  removeKey: (provider: ByokProvider) => api.delete(`/providers/keys/${provider}`),
  setDefaultProvider: (provider: ByokProvider | null) =>
    api.put<{ defaultProvider: string | null }>("/providers/keys/default", { provider }),
  setFeature: (feature: string, provider: ByokProvider | null) =>
    api.put<{ feature: string; provider: ByokProvider | null }>("/providers/features", { feature, provider }),
};
