import { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import * as chatService from "../services/chat.service";
import * as searchService from "../services/search.service";
import { NVIDIA_REASONING_START, NVIDIA_REASONING_END } from "../services/nvidia.service";
import { logger } from "../config/logger";

export const chatValidators = [
  body("message").trim().isLength({ min: 1 }).withMessage("Message is required"),
  body("conversationId").optional().isUUID(),
  body("model").optional().isString(),
  body("language").optional().isString().isLength({ min: 2, max: 20 }),
  body("languageCode").optional().isString().isLength({ min: 2, max: 10 }),
  body("search").optional().isBoolean(),
  body("save").optional().isBoolean(),
  body("fileId").optional().isUUID(),
];

export async function streamChat(req: AuthenticatedRequest, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: "Validation failed", details: errors.array() });
    return;
  }

  try {
    const { message, conversationId, model, language, languageCode, search, save, fileId } = req.body;
    const userId = req.user?.userId;

    // save=false is a pure pass-through (e.g. translating dictated speech): no
    // conversation is created and nothing is persisted — the model sees just
    // this message. Defaults to the existing behavior.
    const shouldSave = save !== false;

    let convId: string | undefined = conversationId;
    let history: Array<{ role: string; content: string; fileId?: string | null }>;
    if (shouldSave) {
      if (!convId) {
        const conv = await chatService.createConversation(userId!, message.slice(0, 50));
        convId = conv.id;
      }
      await chatService.saveMessage(convId, message, "user", model, userId, languageCode, fileId);
      history = await chatService.getConversationMessages(convId);
    } else {
      history = [{ role: "user", content: message }];
    }

    // RAG-lite: retrieve the extracted text of every attached file in this
    // conversation (ownership-checked) and append it to the message that
    // referenced it. This re-runs on every turn, so context comes from the
    // backend at reply time — not from text inlined by the browser.
    const fileContexts = await chatService.getFileContexts(userId!, history);
    const messages = history.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.fileId && fileContexts[m.fileId] ? m.content + fileContexts[m.fileId] : m.content,
    }));

    const languageDirective = language
      ? ` Reply in ${language} — translate your answer into ${language} unless the user writes in another language and asks you not to.`
      : "";
    let systemContent = `You are NexusAI, a helpful AI assistant. Be concise and accurate.${languageDirective}`;

    // Optional live web search (TinyFish, free): fetch results for the user's
    // message and ground the reply in them. Best-effort — a search failure
    // never blocks the chat itself.
    if (search) {
      const results = await searchService.searchWeb(message, { recencyMinutes: 525600 });
      if (results.length) {
        systemContent += `\n\n${searchService.formatSearchResults(message, results)}`;
      }
    }
    const systemMessage = {
      role: "system" as const,
      content: systemContent,
    };

    const allMessages = [systemMessage, ...messages];

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullResponse = "";
    // Deep-reasoning models (e.g. NVIDIA Inkling) stream a thinking phase
    // before the answer. The markers arrive only for the chat feature; they
    // become {thinking}/{reasoning} SSE events so the UI can show an honest
    // "thinking…" state. Reasoning text is never persisted into the reply.
    let inReasoning = false;

    for await (const chunk of chatService.streamChat(allMessages, model, userId)) {
      if (chunk === NVIDIA_REASONING_START) {
        inReasoning = true;
        res.write(`data: ${JSON.stringify({ thinking: true, conversationId: convId })}\n\n`);
        continue;
      }
      if (chunk === NVIDIA_REASONING_END) {
        inReasoning = false;
        res.write(`data: ${JSON.stringify({ thinking: false, conversationId: convId })}\n\n`);
        continue;
      }
      if (inReasoning) {
        res.write(`data: ${JSON.stringify({ reasoning: chunk, conversationId: convId })}\n\n`);
        continue;
      }
      fullResponse += chunk;
      res.write(`data: ${JSON.stringify({ content: chunk, conversationId: convId })}\n\n`);
    }

    // Never persist an empty assistant reply — a blank message in history can
    // make some providers (e.g. Mistral) return empty streams afterwards.
    // (With save=false nothing is persisted at all.)
    if (fullResponse.trim() && shouldSave) {
      await chatService.saveMessage(convId!, fullResponse, "assistant", model, userId, languageCode);
    }

    res.write(`data: ${JSON.stringify({ done: true, conversationId: convId })}\n\n`);
    res.end();
  } catch (error: any) {
    logger.error("Chat stream error:", error);
    res.write(`data: ${JSON.stringify({ error: error.message || "Chat failed" })}\n\n`);
    res.end();
  }
}

export async function getModels(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // Pass the caller id so user-owned BYOK keys unlock their providers.
    const models = await chatService.getAvailableModels(req.user?.userId);
    res.json(models);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function getConversations(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { pinned, archived, search } = req.query;

    const conversations = await chatService.getUserConversations(userId, {
      pinned: pinned === "true" ? true : pinned === "false" ? false : undefined,
      archived: archived === "true" ? true : archived === "false" ? false : undefined,
      search: search as string | undefined,
    });

    res.json(conversations);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function getMessages(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const messages = await chatService.getConversationMessages(id);
    res.json(messages);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function updateConversation(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const { title, isPinned, isArchived } = req.body;

    const conversation = await chatService.updateConversation(id, {
      title,
      isPinned,
      isArchived,
    });

    res.json(conversation);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function deleteConversation(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    await chatService.deleteConversation(id);
    res.json({ message: "Conversation deleted" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
