import { api } from "./api";

export const videoService = {
  generate: (prompt: string, model?: string) =>
    api.post("/video/generate", { prompt, model }),
  getModels: () => api.get("/video/models"),
};
