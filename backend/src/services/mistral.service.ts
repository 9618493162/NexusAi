import { env } from "../config/env";
import { logger } from "../config/logger";

// Mistral is OpenAI-compatible: same /chat/completions contract, streamed
// SSE. The Mistral API key lives server-side only.
export async function* streamMistralChat(
  messages: Array<{ role: string; content: string }>,
  model: string = "mistral-large-latest"
): AsyncGenerator<string, void, unknown> {
  if (!env.MISTRAL_API_KEY) throw new Error("Mistral is not configured (MISTRAL_API_KEY missing)");
  try {
    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Mistral error ${response.status}: ${body.slice(0, 200)}`);
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
    // Mistral's free tier silently returns an empty stream when burst-rate
    // limited — surface it as a visible error instead of a blank reply.
    if (!yielded) {
      throw new Error("Mistral returned an empty response — free-tier rate limit is active. Try again in a moment.");
    }
  } catch (error) {
    logger.error("Mistral streaming error:", error);
    throw error;
  }
}
