import { env } from "../config/env";
import { logger } from "../config/logger";

export async function* streamGeminiChat(
  messages: Array<{ role: string; content: string }>,
  model: string = "gemini-flash-latest",
  apiKey?: string
): AsyncGenerator<string, void, unknown> {
  try {
    // Prefer the caller's key (user-owned BYOK key when present), else the
    // server env key.
    const key = apiKey ?? env.GEMINI_API_KEY;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key || "")}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
          generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
        }),
        // A stuck upstream must never wedge the whole provider — abort after a
        // generous budget so the caller surfaces an error instead of hanging.
        signal: AbortSignal.timeout(90_000),
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Gemini error ${response.status}: ${body.slice(0, 200)}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE events are separated by newlines; a line can span two network chunks.
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        try {
          const data = JSON.parse(trimmed.slice(5).trim());
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (text) yield text;
        } catch {
          // Skip malformed SSE frames
        }
      }
    }
  } catch (error) {
    logger.error("Gemini streaming error:", error);
    throw error;
  }
}
