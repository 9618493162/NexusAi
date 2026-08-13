import { api, refreshAccessToken } from "./api";
import { useAuthStore } from "@/store/auth.store";

export const chatService = {
  getModels: () => api.get("/chat/models"),
  streamChat: async (message: string, conversationId?: string, model?: string, language?: string, languageCode?: string, search?: boolean, save?: boolean, fileId?: string) => {
    const doFetch = (token: string | null) =>
      fetch(`${api.defaults.baseURL}/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message, conversationId, model, language, languageCode, search, save, fileId }),
      });

    let response = await doFetch(useAuthStore.getState().accessToken);
    if (response.status === 401) {
      // Token expired/invalidated (e.g. after JWT rotation) — refresh once and retry.
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
  getConversations: (params?: { pinned?: boolean; archived?: boolean; search?: string }) =>
    api.get("/chat/conversations", { params }),
  getMessages: (conversationId: string) => api.get(`/chat/conversations/${conversationId}/messages`),
  updateConversation: (id: string, data: Partial<{ title: string; isPinned: boolean; isArchived: boolean }>) =>
    api.patch(`/chat/conversations/${id}`, data),
  deleteConversation: (id: string) => api.delete(`/chat/conversations/${id}`),
};
