import { api } from "./api";

export const fileService = {
  upload: (file: File, conversationId?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    if (conversationId) formData.append("conversationId", conversationId);
    return api.post("/files/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  getFiles: () => api.get("/files/"),
  deleteFile: (id: string) => api.delete(`/files/${id}`),
};
