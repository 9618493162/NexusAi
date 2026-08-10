import { api } from "./api";

export const imageService = {
  generate: (prompt: string, model?: string) =>
    api.post("/image/generate", { prompt, model }),
  getModels: () => api.get("/image/models"),
};
