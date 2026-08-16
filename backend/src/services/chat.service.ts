import Groq from "groq-sdk";
import { groq, GROQ_MODELS } from "../config/ai";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { streamGeminiChat } from "./gemini.service";
import { streamOpenRouterChat } from "./openrouter.service";
import { streamMistralChat } from "./mistral.service";
import { streamKimiChat } from "./kimi.service";
import { streamNvidiaChat, NVIDIA_MODELS, NVIDIA_MODEL_NAMES } from "./nvidia.service";
import { streamGridChat, GRID_MODELS } from "./grid.service";
import { resolveProviderKey, resolveAutoModel, recordKeyUsage, BYOK_PROVIDERS } from "./provider-keys.service";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

const GROQ_MODEL_IDS: Set<string> = new Set(Object.values(GROQ_MODELS));
const GRID_MODEL_IDS: Set<string> = new Set(Object.values(GRID_MODELS));

export function detectProvider(model: string): "groq" | "gemini" | "openrouter" | "mistral" | "nvidia" | "kimi" | "grid" {
  if (GRID_MODEL_IDS.has(model)) return "grid";
  if (model.startsWith("gemini")) return "gemini";
  if (NVIDIA_MODEL_NAMES[model]) return "nvidia";
  if (model.startsWith("kimi")) return "kimi";
  // Groq ids can contain "/" (e.g. qwen/qwen3.6-27b) — match them before the
  // generic OpenRouter rule so they don't get misrouted.
  if (GROQ_MODEL_IDS.has(model)) return "groq";
  if (model.includes("/")) return "openrouter";
  if (/^(mistral|codestral|ministral|devstral|magistral|voxtral|open-mistral|open-mixtral)/.test(model)) return "mistral";
  return "groq";
}

export async function* streamChat(
  messages: ChatMessage[],
  model: string = "gemini-flash-latest",
  userId?: string,
  feature: string = "chat"
): AsyncGenerator<string, void, unknown> {
  // Auto: resolve the model against the user's feature/default provider
  // preferences (BYOK) — the frontend never picks the provider itself.
  if (!model || model === "auto" || model === "best") {
    const resolved = await resolveAutoModel(userId, feature);
    model = resolved.model;
  }
  const provider = detectProvider(model);

  try {
    let fullContent = "";
    // BYOK: the user's own key for this provider wins when present; provider
    // services fall back to the server env key when this is null.
    const userKey = await resolveProviderKey(userId, provider);

    if (provider === "gemini") {
      for await (const chunk of streamGeminiChat(messages, model, userKey ?? undefined)) {
        fullContent += chunk;
        yield chunk;
      }
    } else if (provider === "openrouter") {
      for await (const chunk of streamOpenRouterChat(messages, model, userKey ?? undefined)) {
        fullContent += chunk;
        yield chunk;
      }
    } else if (provider === "mistral") {
      for await (const chunk of streamMistralChat(messages, model, userKey ?? undefined)) {
        fullContent += chunk;
        yield chunk;
      }
    } else if (provider === "kimi") {
      for await (const chunk of streamKimiChat(messages, model, userKey ?? undefined)) {
        fullContent += chunk;
        yield chunk;
      }
    } else if (provider === "grid") {
      for await (const chunk of streamGridChat(messages, model, userKey ?? undefined)) {
        fullContent += chunk;
        yield chunk;
      }
    } else if (provider === "nvidia") {
      for await (const chunk of streamNvidiaChat(messages, model, userKey ?? undefined)) {
        fullContent += chunk;
        yield chunk;
      }
    } else {
      // Default: Groq. A user-owned key gets its own client instance (the
      // shared one is bound to the server env key); otherwise reuse it.
      const client = userKey ? new Groq({ apiKey: userKey }) : groq;
      const completion = await client.chat.completions.create({
        messages: messages as any,
        model,
        stream: true,
        temperature: 0.7,
        max_tokens: 4096,
      });

      for await (const chunk of completion) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullContent += content;
          yield content;
        }
      }
    }

    // Log usage
    if (userId) {
      await prisma.usageStat.create({
        data: {
          userId,
          model,
          tokens: fullContent.length / 4,
          type: "chat",
        },
      });
    }

    // BYOK: real token usage against the user's own key (best-effort).
    if (userId && userKey) {
      await recordKeyUsage(userId, provider, fullContent.length / 4);
    }
  } catch (error) {
    logger.error(`Chat streaming error (${provider}):`, error);
    throw error;
  }
}

export async function getAvailableModels(userId?: string) {
  // BYOK: which providers does THIS user have a working credential for?
  // The server env key still counts; on top of that a user-owned key unlocks
  // a provider (e.g. Kimi / OpenRouter / Grid, whose server keys are dead).
  const userProviders = userId
    ? new Set(
        (await prisma.providerKey.findMany({ where: { userId }, select: { provider: true } })).map((k) => k.provider)
      )
    : new Set<string>();
  const has = (p: string) => userProviders.has(p);

  // The "Auto" entry — routes through the user's default provider (BYOK)
  // unless they pinned a specific provider for this feature.
  const defaultProvider = userId
    ? ((await prisma.user.findUnique({ where: { id: userId }, select: { defaultChatProvider: true } }))
        ?.defaultChatProvider ?? null)
    : null;
  const defaultUsable =
    !!defaultProvider &&
    (userProviders.has(defaultProvider) || BYOK_PROVIDERS.some((p) => p.id === defaultProvider && p.serverConfigured));
  const autoName = defaultUsable
    ? `Auto — ${BYOK_PROVIDERS.find((p) => p.id === defaultProvider)?.name ?? defaultProvider} (your default)`
    : "Auto — best for task";

  const models: Array<{ id: string; name: string; provider: string; context: string }> = [
    { id: "auto", name: autoName, provider: "auto", context: "—" },
    // Groq — fastest provider; all models verified live with the current key.
    { id: GROQ_MODELS.LLAMA_70B, name: "LLaMA 3.3 70B (Groq)", provider: "groq", context: "128k" },
    { id: GROQ_MODELS.LLAMA_8B, name: "LLaMA 3.1 8B (Groq)", provider: "groq", context: "128k" },
    { id: GROQ_MODELS.QWEN_27B, name: "Qwen 3.6 27B (Groq)", provider: "groq", context: "128k" },
    { id: GROQ_MODELS.GPT_OSS_120B, name: "GPT-OSS 120B (Groq)", provider: "groq", context: "128k" },
    { id: GROQ_MODELS.COMPOUND_MINI, name: "Groq Compound Mini", provider: "groq", context: "128k" },
  ];

  // Google Gemini — flash-tier models. Requires a server or user key.
  if (env.GEMINI_API_KEY || has("gemini")) {
    models.push(
      { id: "gemini-flash-latest", name: "Gemini Flash (Google)", provider: "gemini", context: "1M" },
      { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash (Google)", provider: "gemini", context: "1M" },
      { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite (Google)", provider: "gemini", context: "1M" },
      { id: "gemini-3-flash-preview", name: "Gemini 3 Flash (Google)", provider: "gemini", context: "1M" }
    );
  }

  // Mistral — OpenAI-compatible, requires a server or user key.
  if (env.MISTRAL_API_KEY || has("mistral")) {
    models.push(
      { id: "mistral-large-latest", name: "Mistral Large", provider: "mistral", context: "128k" },
      { id: "mistral-medium-latest", name: "Mistral Medium", provider: "mistral", context: "32k" },
      { id: "mistral-small-latest", name: "Mistral Small", provider: "mistral", context: "32k" },
      { id: "codestral-latest", name: "Codestral (code)", provider: "mistral", context: "256k" }
    );
  }

  // NVIDIA NIM — serverless models, OpenAI-compatible, requires a key.
  if (env.NVIDIA_NIM_API_KEY || has("nvidia")) {
    models.push(
      ...Object.values(NVIDIA_MODELS).map((id) => ({
        id,
        name: NVIDIA_MODEL_NAMES[id],
        provider: "nvidia" as const,
        context: "128k",
      }))
    );
  }

  // BYOK-unlocked providers: the server env keys are dead today (no balance /
  // rejected), so these only appear once the USER brings a working key.
  if (has("kimi")) {
    models.push({ id: "kimi-k2.6", name: "Kimi K2.6 (Moonshot)", provider: "kimi", context: "256k" });
  }
  if (has("openrouter")) {
    models.push(
      { id: "openai/gpt-4o", name: "GPT-4o (OpenRouter)", provider: "openrouter", context: "128k" },
      { id: "deepseek/deepseek-chat", name: "DeepSeek Chat (OpenRouter)", provider: "openrouter", context: "64k" }
    );
  }
  if (has("grid")) {
    models.push(
      ...Object.values(GRID_MODELS).map((id) => ({
        id,
        name: id === GRID_MODELS.AUTO ? "Grid Auto (best worker)" : id === GRID_MODELS.DEEPSEEK_V4 ? "DeepSeek V4 (Grid)" : "GPT-OSS 120B (Grid)",
        provider: "grid" as const,
        context: "128k",
      }))
    );
  }

  return models;
}

export async function saveMessage(
  conversationId: string,
  content: string,
  role: "user" | "assistant",
  model?: string,
  userId?: string,
  language?: string,
  fileId?: string
) {
  return prisma.message.create({
    data: { content, role, model, language, conversationId, userId, ...(fileId ? { fileId } : {}) },
  });
}

export async function createConversation(userId: string, title?: string) {
  return prisma.conversation.create({
    data: { userId, title: title || "New Chat" },
  });
}

export async function getConversationMessages(conversationId: string) {
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * How much extracted text is injected as file context per attached file.
 * Mirrors the upload response's 20k slice so the model never sees more than
 * the frontend would have inlined before.
 */
const FILE_CONTEXT_LIMIT = 20000;

/**
 * RAG-lite retrieval: for the given user's messages, look up every attached
 * file by id (ownership-scoped — a user can never pull another user's file)
 * and build the exact `[File: name]` context blocks. Files without real
 * extracted text are skipped, and a deleted/missing file simply yields no
 * context. No vector store: the file's extracted text IS the retrieval unit.
 */
export async function getFileContexts(
  userId: string,
  messages: Array<{ fileId?: string | null }>
): Promise<Record<string, string>> {
  const ids = Array.from(new Set(messages.map((m) => m.fileId).filter((id): id is string => !!id)));
  if (ids.length === 0) return {};

  const files = await prisma.file.findMany({
    where: { id: { in: ids }, userId }, // ownership enforced server-side
    select: { id: true, originalName: true, extractedText: true },
  });

  const contexts: Record<string, string> = {};
  for (const file of files) {
    const text = (file.extractedText || "").trim();
    if (!text || text === "File processing disabled") continue;
    contexts[file.id] = `\n\n[File: ${file.originalName}]\n${text.slice(0, FILE_CONTEXT_LIMIT)}`;
  }
  return contexts;
}

export async function getUserConversations(
  userId: string,
  options?: { pinned?: boolean; archived?: boolean; search?: string }
) {
  const where: any = { userId };
  if (options?.pinned !== undefined) where.isPinned = options.pinned;
  if (options?.archived !== undefined) where.isArchived = options.archived;
  if (options?.search) {
    where.title = { contains: options.search, mode: "insensitive" };
  }

  return prisma.conversation.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, createdAt: true },
      },
    },
  });
}

export async function updateConversation(
  conversationId: string,
  data: { title?: string; isPinned?: boolean; isArchived?: boolean }
) {
  return prisma.conversation.update({ where: { id: conversationId }, data });
}

export async function deleteConversation(conversationId: string) {
  return prisma.conversation.delete({ where: { id: conversationId } });
}
