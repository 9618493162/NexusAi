import { api, refreshAccessToken } from "./api";
import { useAuthStore } from "@/store/auth.store";

export interface Meeting {
  id: string;
  title: string;
  status: "live" | "ended";
  sourceLang: string;
  targetLang: string;
  transcript: string;
  translation: string | null;
  summary: string | null;
  actionItems: string | null;
  notes: string | null;
  durationSec: number;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const meetingsService = {
  list: () => api.get<{ meetings: Meeting[] }>("/meetings"),
  get: (id: string) => api.get<{ meeting: Meeting }>(`/meetings/${id}`),
  create: (data: { title: string; sourceLang?: string; targetLang?: string }) =>
    api.post<{ meeting: Meeting }>("/meetings", data),
  update: (
    id: string,
    data: Partial<{
      title: string;
      status: string;
      transcript: string;
      translation: string | null;
      summary: string | null;
      actionItems: string | null;
      notes: string | null;
      durationSec: number;
      endedAt: string | null;
    }>
  ) => api.patch<{ meeting: Meeting }>(`/meetings/${id}`, data),
  remove: (id: string) => api.delete(`/meetings/${id}`),

  /** SSE summary — same token-refresh-once pattern as chatService.streamChat. */
  summarize: async (id: string) => {
    const doFetch = (token: string | null) =>
      fetch(`${api.defaults.baseURL}/meetings/${id}/summarize`, {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
    let response = await doFetch(useAuthStore.getState().accessToken);
    if (response.status === 401) {
      try {
        const freshToken = await refreshAccessToken();
        response = await doFetch(freshToken);
      } catch {
        useAuthStore.getState().logout();
        window.location.href = "/login";
        throw new Error("Session expired, please log in again");
      }
    }
    return response;
  },
};
