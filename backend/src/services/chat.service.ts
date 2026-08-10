import { groq, GROQ_MODELS } from "../config/ai";
import { prisma } from "../config/database";
import { logger } from "../config/logger";
import { streamGeminiChat } from "./gemini.service";
import { streamOpenRouterChat } from "./openrouter.service";
import { streamMistralChat } from "./mistral.service";
import { streamNvidiaChat, NVIDIA_MODELS, NVIDIA_MODEL_NAMES } from "./nvidia.service";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

const GROQ_MODEL_IDS: Set<string> = new Set(Object.values(GROQ_MODELS));

export function detectProvider(model: string): "groq" | "gemini" | "openrouter" | "mistral" | "nvidia" {
  if (model.startsWith("gemini")) return "gemini";
  if (NVIDIA_MODEL_NAMES[model]) return "nvidia";
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
  userId?: string
): AsyncGenerator<string, void, unknown> {
  const provider = detectProvider(model);

  try {
    let fullContent = "";

    if (provider === "gemini") {
      for await (const chunk of streamGeminiChat(messages, model)) {
        fullContent += chunk;
        yield chunk;
      }
    } else if (provider === "openrouter") {
      for await (const chunk of streamOpenRouterChat(messages, model)) {
        fullContent += chunk;
        yield chunk;
      }
    } else if (provider === "mistral") {
      for await (const chunk of streamMistralChat(messages, model)) {
        fullContent += chunk;
        yield chunk;
      }
    } else if (provider === "nvidia") {
      for await (const chunk of streamNvidiaChat(messages, model)) {
        fullContent += chunk;
        yield chunk;
      }
    } else {
      // Default: Groq
      const completion = await groq.chat.completions.create({
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
  } catch (error) {
    logger.error(`Chat streaming error (${provider}):`, error);
    throw error;
  }
}

export async function getAvailableModels() {
  return [
    // Groq — fastest provider; all models verified live with the current key.
    { id: GROQ_MODELS.LLAMA_70B, name: "LLaMA 3.3 70B (Groq)", provider: "groq", context: "128k" },
    { id: GROQ_MODELS.LLAMA_8B, name: "LLaMA 3.1 8B (Groq)", provider: "groq", context: "128k" },
    { id: GROQ_MODELS.QWEN_27B, name: "Qwen 3.6 27B (Groq)", provider: "groq", context: "128k" },
    { id: GROQ_MODELS.GPT_OSS_120B, name: "GPT-OSS 120B (Groq)", provider: "groq", context: "128k" },
    { id: GROQ_MODELS.COMPOUND_MINI, name: "Groq Compound Mini", provider: "groq", context: "128k" },
    // OpenRouter — works with the configured key (limited credit).
    { id: "openai/gpt-4o", name: "GPT-4o (OpenRouter)", provider: "openrouter", context: "128k" },
    { id: "deepseek/deepseek-chat", name: "DeepSeek Chat (OpenRouter)", provider: "openrouter", context: "128k" },
    // Google Gemini — flash-tier models available to this account with working quota.
    { id: "gemini-flash-latest", name: "Gemini Flash (Google)", provider: "gemini", context: "1M" },
    { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash (Google)", provider: "gemini", context: "1M" },
    { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite (Google)", provider: "gemini", context: "1M" },
    { id: "gemini-3-flash-preview", name: "Gemini 3 Flash (Google)", provider: "gemini", context: "1M" },
    // Mistral — OpenAI-compatible, wired with the configured key.
    { id: "mistral-large-latest", name: "Mistral Large", provider: "mistral", context: "128k" },
    { id: "mistral-medium-latest", name: "Mistral Medium", provider: "mistral", context: "32k" },
    { id: "mistral-small-latest", name: "Mistral Small", provider: "mistral", context: "32k" },
    { id: "codestral-latest", name: "Codestral (code)", provider: "mistral", context: "256k" },
    // NVIDIA NIM — serverless models, OpenAI-compatible.
    ...Object.values(NVIDIA_MODELS).map((id) => ({
      id,
      name: NVIDIA_MODEL_NAMES[id],
      provider: "nvidia" as const,
      context: "128k",
    })),
  ];
}

export async function saveMessage(
  conversationId: string,
  content: string,
  role: "user" | "assistant",
  model?: string,
  userId?: string,
  language?: string
) {
  return prisma.message.create({
    data: { content, role, model, language, conversationId, userId },
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
