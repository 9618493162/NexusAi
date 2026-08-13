import { api, refreshAccessToken } from "./api";
import { useAuthStore } from "@/store/auth.store";

/**
 * How much extracted text we embed per analysis message. Mirrors the backend
 * upload response (which also slices to 20k chars) to keep token costs sane.
 */
export const FILE_TEXT_LIMIT = 20000;

/** The backend's authoritative upload limit (upload.middleware.ts). */
export const FILE_SIZE_LIMIT = 50 * 1024 * 1024;

/**
 * Builds the file context block that gets embedded in an analysis message,
 * exactly like the Chat page's attach flow ("[File: name]\n<extractedText>").
 */
export function buildFileContext(file: { originalName: string; extractedText?: string }): string {
  const text = (file.extractedText || "").slice(0, FILE_TEXT_LIMIT);
  return `\n\n[File: ${file.originalName}]\n${text}`;
}

/** True when the file actually has extractable text to analyze. */
export function fileHasText(file: { extractedText?: string }): boolean {
  const t = (file.extractedText || "").trim();
  return t.length > 0 && t !== "File processing disabled";
}

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
  getSupportedTypes: () => api.get("/files/supported-types"),
  deleteFile: (id: string) => api.delete(`/files/${id}`),
  /**
   * Authenticated URL for this file's real content (ownership-checked on the
   * backend). Used for image/audio/video previews and downloads.
   */
  streamUrl: (id: string, download = false) =>
    `${api.defaults.baseURL}/files/${id}/stream?token=${encodeURIComponent(useAuthStore.getState().accessToken || "")}${download ? "&download=1" : ""}`,
  /** Download the stored file via the ownership-checked stream endpoint. */
  async download(id: string, originalName: string): Promise<void> {
    const token = useAuthStore.getState().accessToken;
    const url = `${api.defaults.baseURL}/files/${id}/stream?download=1`;
    const doFetch = (t: string | null) =>
      fetch(url, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
    let res = await doFetch(token);
    if (res.status === 401) {
      try {
        const fresh = await refreshAccessToken();
        res = await doFetch(fresh);
      } catch {
        return;
      }
    }
    if (!res.ok) return;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = originalName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
  },
};
