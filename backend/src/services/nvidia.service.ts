import { env } from "../config/env";
import { logger } from "../config/logger";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

// Models verified to be served on the serverless API for this account.
// Ordered best-first for the frontend model picker.
export const NVIDIA_MODELS = {
  GLM_5_2: "z-ai/glm-5.2",
  INKLING: "thinkingmachines/inkling",
  NEMOTRON_3_ULTRA_550B: "nvidia/nemotron-3-ultra-550b-a55b",
  NEMOTRON_SUPER_49B: "nvidia/llama-3.3-nemotron-super-49b-v1",
  NEMOTRON_3_SUPER_120B: "nvidia/nemotron-3-super-120b-a12b",
  NEMOTRON_3_NANO_30B: "nvidia/nemotron-3-nano-30b-a3b",
  GPT_OSS_20B: "openai/gpt-oss-20b",
  NEMOTRON_MINI_4B: "nvidia/nemotron-mini-4b-instruct",
} as const;

// Note: openai/gpt-oss-120b is deliberately NOT here — Groq already offers it
// under the same id, so including it would put a duplicate value in the model
// picker (React duplicate-key warning + ambiguous routing).

export const NVIDIA_MODEL_NAMES: Record<string, string> = {
  [NVIDIA_MODELS.GLM_5_2]: "GLM 5.2 (NVIDIA)",
  [NVIDIA_MODELS.INKLING]: "Inkling — Deep Reasoning (NVIDIA)",
  [NVIDIA_MODELS.NEMOTRON_3_ULTRA_550B]: "Nemotron 3 Ultra 550B (NVIDIA)",
  [NVIDIA_MODELS.NEMOTRON_SUPER_49B]: "Nemotron Super 49B (NVIDIA)",
  [NVIDIA_MODELS.NEMOTRON_3_SUPER_120B]: "Nemotron 3 Super 120B (NVIDIA)",
  [NVIDIA_MODELS.NEMOTRON_3_NANO_30B]: "Nemotron 3 Nano 30B (NVIDIA)",
  [NVIDIA_MODELS.GPT_OSS_20B]: "GPT-OSS 20B (NVIDIA)",
  [NVIDIA_MODELS.NEMOTRON_MINI_4B]: "Nemotron Mini 4B (NVIDIA)",
};

// Nemotron Mini 4B caps at 4096 total context, so it needs a smaller
// completion budget than the 4096-token default used for larger models.
// Inkling reasons before it answers (it emits reasoning_content first), so it
// gets a generous budget — cutting it short would leave the user with nothing
// but an unfinished train of thought.
const MAX_TOKENS_BY_MODEL: Record<string, number> = {
  [NVIDIA_MODELS.NEMOTRON_MINI_4B]: 1024,
  [NVIDIA_MODELS.INKLING]: 16384,
};

// Sentinels that frame the reasoning phase of a "deep reasoning" model.
// streamChat (the single funnel for every consumer) strips them for all
// features except chat, and the chat controller turns them into
// {thinking}/{reasoning} SSE events — so agents, documents, meetings and
// workflows never see reasoning text in their output.
export const NVIDIA_REASONING_START = "\u0000NEXUS_REASONING_START\u0000";
export const NVIDIA_REASONING_END = "\u0000NEXUS_REASONING_END\u0000";

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
    // Deep-reasoning models emit reasoning_content before content. The markers
    // frame the reasoning phase so the chat controller can surface it as an
    // honest "thinking…" state; every other feature strips it out.
    let inReasoning = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter((line) => line.trim());
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            // The model stopped mid-reasoning (e.g. hit its token budget) —
            // close the reasoning frame so the UI never stays stuck in
            // "thinking".
            if (inReasoning) {
              inReasoning = false;
              yield NVIDIA_REASONING_END;
            }
            continue;
          }
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta || {};
            const reasoning = delta.reasoning_content || "";
            const content = delta.content || "";
            if (reasoning) {
              if (!inReasoning) {
                inReasoning = true;
                yield NVIDIA_REASONING_START;
              }
              yield reasoning;
            }
            if (content) {
              if (inReasoning) {
                inReasoning = false;
                yield NVIDIA_REASONING_END;
              }
              yield content;
            }
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
