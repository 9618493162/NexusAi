import { api, refreshAccessToken } from "./api";
import { useAuthStore } from "@/store/auth.store";

// WebSocket URL for Deepgram live transcription, proxied through the backend
// (the Deepgram key never reaches the browser — we authenticate with our JWT).
// The stored token may be expired (axios refreshes on 401, but a WebSocket has
// no such hook), so refresh it proactively before connecting.
export async function getLiveSocketUrl(language?: string): Promise<string> {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
  const wsBase = API_URL.replace(/^http/, "ws");
  let token = useAuthStore.getState().accessToken || "";
  try {
    // JWT payloads are base64url — convert to standard base64 for atob.
    const b64 = (token.split(".")[1] || "").replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64));
    if (!payload.exp || payload.exp * 1000 < Date.now() + 60_000) {
      token = await refreshAccessToken();
    }
  } catch {
    // Unparseable/absent token — the backend will reject and surface it.
  }
  const langParam = language ? `&language=${encodeURIComponent(language)}` : "";
  return `${wsBase}/api/voice/live?token=${encodeURIComponent(token)}${langParam}`;
}

export const voiceService = {
  // Send recorded audio to the backend, which transcribes it via Deepgram.
  async transcribe(blob: Blob, language?: string): Promise<string> {
    // Strip the codecs parameter ("audio/webm;codecs=opus" -> "audio/webm") —
    // Deepgram wants a plain media type.
    const type = (blob.type || "audio/webm").split(";")[0];
    const res = await api.post("/voice/transcribe", blob, {
      headers: { "Content-Type": type },
      params: language ? { language } : undefined,
    });
    return (res.data?.transcript as string) || "";
  },

  // Synthesize speech via the backend (mp3 bytes). English uses the Deepgram
  // aura voice picker; non-English uses free Edge neural voices for the
  // language.
  async speak(text: string, voice?: string, language?: string): Promise<Blob> {
    const res = await api.post("/voice/speak", { text, voice, language }, { responseType: "blob" });
    return res.data as Blob;
  },

  // Available TTS voices (catalog lives on the backend, verified against the key).
  async getVoices(): Promise<Array<{ id: string; name: string; language: string }>> {
    const res = await api.get("/voice/voices");
    return (res.data as Array<{ id: string; name: string; language: string }>) || [];
  },

  // Per-language Edge neural voices (male/female where available).
  async getEdgeVoices(): Promise<Array<{ id: string; language: string; name: string; gender: "Female" | "Male" }>> {
    const res = await api.get("/voice/edge-voices");
    return (res.data as Array<{ id: string; language: string; name: string; gender: "Female" | "Male" }>) || [];
  },

  // Languages for STT + translated replies (catalog lives on the backend).
  async getLanguages(): Promise<Array<{ code: string; name: string; bcp47: string }>> {
    const res = await api.get("/voice/languages");
    return (res.data as Array<{ code: string; name: string; bcp47: string }>) || [];
  },
};
