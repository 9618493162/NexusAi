import { api } from "./api";

export interface ProviderStatus {
  id: string;
  name: string;
  usedFor: string;
  configured: boolean;
  status: "ok" | "low" | "no_credits" | "invalid" | "configured";
  detail?: string;
}

export const providersService = {
  getStatus: () => api.get<{ providers: ProviderStatus[] }>("/providers/status"),
};
