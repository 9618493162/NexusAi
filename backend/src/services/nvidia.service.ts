import { env } from "../config/env";
import { logger } from "../config/logger";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

// Models verified to be served on the serverless API for this account.
// Ordered best-first for the frontend model picker.
export const NVIDIA_MODELS = {
  NEMOTRON_3_ULTRA_550B: "nvidia/nemotron-3-ultra-550b-a55b",
  NEMOTRON_SUPER_49B: "nvidia/llama-3.3-nemotron-super-49b-v1",
  NEMOTRON_3_SUPER_120B: "nvidia/nemotron-3-super-120b-a12b",
  NEMOTRON_3_NANO_30B: "nvidia/nemotron-3-nano-30b-a3b",
  GPT_OSS_20B: "openai/gpt-oss-20b",
  NEMOTRON_MINI_4B: "nvidia/nemotron-mini-4b-instruct",
} as const;

export const NVIDIA_MODEL_NAMES: Record<string, string> = {
  [NVIDIA_MODELS.NEMOTRON_3_ULTRA_550B]: "Nemotron 3 Ultra 550B (NVIDIA)",
  [NVIDIA_MODELS.NEMOTRON_SUPER_49B]: "Nemotron Super 49B (NVIDIA)",
  [NVIDIA_MODELS.NEMOTRON_3_SUPER_120B]: "Nemotron 3 Super 120B (NVIDIA)",
  [NVIDIA_MODELS.NEMOTRON_3_NANO_30B]: "Nemotron 3 Nano 30B (NVIDIA)",
  [NVIDIA_MODELS.GPT_OSS_20B]: "GPT-OSS 20B (NVIDIA)",
  [NVIDIA_MODELS.NEMOTRON_MINI_4B]: "Nemotron Mini 4B (NVIDIA)",
};

// Nemotron Mini 4B caps at 4096 total context, so it needs a smaller
// completion budget than the 4096-token default used for larger models.
const MAX_TOKENS_BY_MODEL: Record<string, number> = {
  [NVIDIA_MODELS.NEMOTRON_MINI_4B]: 1024,
};

export async function* streamNvidiaChat(
  messages: Array<{ role: string; content: string }>,
  model: string = NVIDIA_MODELS.NEMOTRON_SUPER_49B,
  apiKey?: string
): AsyncGenerator<string, void, unknown> {
  try {
    const key = apiKey ?? env.NVIDIA_NIM_API_KEY;
    const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
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
        max_tokens: MAX_TOKENS_BY_MODEL[model] ?? 4096,
      }),
      // Generous budget — serverless cold starts can take ~70s — but a stuck
      // upstream must still never wedge the provider pool.
      signal: AbortSignal.timeout(180_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`NVIDIA NIM error ${response.status}: ${body.slice(0, 200)}`);
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
    logger.error("NVIDIA NIM streaming error:", error);
    throw error;
  }
}
