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

export const providersService = {
  getStatus: () => api.get<{ providers: ProviderStatus[] }>("/providers/status"),
  getModelCatalog: () => api.get<ModelCatalog>("/providers/models"),
  getNvidiaHealth: () => api.get<NvidiaHealth>("/providers/nvidia/health"),
};
