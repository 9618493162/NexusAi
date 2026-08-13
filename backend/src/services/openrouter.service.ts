import { env } from "../config/env";
import { logger } from "../config/logger";

export async function* streamOpenRouterChat(
  messages: Array<{ role: string; content: string }>,
  model: string = "openai/gpt-4o"
): AsyncGenerator<string, void, unknown> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": env.FRONTEND_URL,
        "X-Title": "NexusAI",
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.7,
        // Keep max_tokens modest — OpenRouter rejects requests that exceed the
        // account's remaining credit (402) otherwise.
        max_tokens: 1024,
      }),
      // Never wedge the provider pool on a stuck upstream.
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`OpenRouter error ${response.status}: ${body.slice(0, 200)}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
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
            if (content) yield content;
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  } catch (error) {
    logger.error("OpenRouter streaming error:", error);
    throw error;
  }
}
