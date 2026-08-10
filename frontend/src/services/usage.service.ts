import { api } from "./api";

export const usageService = {
  getUsage: () => api.get("/usage/"),
};
