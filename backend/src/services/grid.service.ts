import { env } from "../config/env";
import { logger } from "../config/logger";

/**
 * AI Power Grid (aipowergrid.io) — free decentralized inference.
 * OpenAI-compatible chat streaming with real token-by-token SSE. Models
 * served depend on which GPU workers are connected (see /v1/models at
 * runtime); the ids below were observed live on the current worker set.
 *
 * Model ids use a `grid-` prefix (e.g. `grid-gpt-oss-120b`) so they never
 * collide with Groq's `openai/gpt-oss-120b` in provider routing; the prefix
 * is stripped before the API call.
 */

export const GRID_MODELS = {
  GPT_OSS_120B: "grid-gpt-oss-120b",
  DEEPSEEK_V4: "grid-deepseek-v4-flash-nvfp4",
  AUTO: "grid-auto",
} as const;

const BASE_URL = "https://api.aipowergrid.io/v1";

function gridConfigured(): boolean {
  return !!env.GRID_API_KEY;
}

function resolveApiModel(model: string): string {
  if (model.startsWith("grid-")) return model.slice("grid-".length);
  return model;
}

export async function* streamGridChat(
  messages: Array<{ role: string; content: string }>,
  model: string = GRID_MODELS.GPT_OSS_120B
): AsyncGenerator<string, void, unknown> {
  if (!gridConfigured()) throw new Error("Grid is not configured (GRID_API_KEY missing)");

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.GRID_API_KEY}`,
      },
      body: JSON.stringify({
        model: resolveApiModel(model),
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 2048,
      }),
      // Never wedge the provider pool on a stuck upstream.
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Grid error ${response.status}: ${body.slice(0, 200)}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || "";
          if (content) yield content;
        } catch {
          // Skip malformed SSE frames
        }
      }
    }
  } catch (error) {
    logger.error("Grid streaming error:", error);
    throw error;
  }
}
