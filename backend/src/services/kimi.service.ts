import { env } from "../config/env";
import { logger } from "../config/logger";

// Kimi (Moonshot AI) is OpenAI-compatible: same /chat/completions contract,
// streamed SSE, on the international api.moonshot.ai endpoint. The key lives
// server-side only.
export async function* streamKimiChat(
  messages: Array<{ role: string; content: string }>,
  model: string = "kimi-k2.6",
  apiKey?: string
): AsyncGenerator<string, void, unknown> {
  const key = apiKey ?? env.KIMI_API_KEY;
  if (!key) throw new Error("Kimi is not configured (KIMI_API_KEY missing)");
  try {
    const response = await fetch("https://api.moonshot.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 2048,
      }),
      // Never wedge the provider pool on a stuck upstream.
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      // Surface the account-level quota state so users see why it failed.
      throw new Error(`Kimi error ${response.status}: ${body.slice(0, 200)}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let yielded = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter((line) => line.trim());
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || "";
            if (content) {
              yielded = true;
              yield content;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
    if (!yielded) {
      throw new Error("Kimi returned an empty response — the account may be out of balance. Top up at platform.moonshot.ai and try again.");
    }
  } catch (error) {
    logger.error("Kimi streaming error:", error);
    throw error;
  }
}
