import { Request, Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { logger } from "../config/logger";

const PER_TYPE_LIMIT = 5;

/** Escape LIKE wildcards so user input matches literally. */
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** Collapse whitespace and cap length for a clean snippet. */
function truncate(text: string, max = 180): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + "…" : clean;
}

interface SearchResult {
  type: "conversation" | "message" | "file" | "audio";
  id: string;
  title: string;
  snippet: string;
  createdAt: string;
  updatedAt: string;
  meta: Record<string, unknown>;
}

/**
 * Global search across the signed-in user's own data only. Every query is
 * scoped to `userId` (or the user's conversations), so a user can never see
 * another user's content. Case-insensitive ILIKE via Prisma's `contains`
 * with `mode: "insensitive"` — no extra schema or search index needed for
 * a personal workspace.
 */
export async function globalSearch(req: AuthenticatedRequest, res: Response): Promise<void> {
  const raw = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!raw) {
    res.json({ query: "", results: [] });
    return;
  }

  const userId = req.user!.userId;
  const q = `%${escapeLike(raw)}%`;

  try {
    const [conversations, messages, files, voiceSessions] = await Promise.all([
      prisma.conversation.findMany({
        where: { userId, title: { contains: raw, mode: "insensitive" } },
        orderBy: { updatedAt: "desc" },
        take: PER_TYPE_LIMIT,
        include: { _count: { select: { messages: true } } },
      }),
      prisma.message.findMany({
        where: { conversation: { userId }, content: { contains: raw, mode: "insensitive" } },
        orderBy: { createdAt: "desc" },
        take: PER_TYPE_LIMIT,
        include: { conversation: { select: { id: true, title: true } } },
      }),
      prisma.file.findMany({
        where: {
          userId,
          OR: [
            { originalName: { contains: raw, mode: "insensitive" } },
            { filename: { contains: raw, mode: "insensitive" } },
            { extractedText: { contains: raw, mode: "insensitive" } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: PER_TYPE_LIMIT,
      }),
      prisma.voiceSession.findMany({
        where: {
          userId,
          OR: [
            { transcript: { contains: raw, mode: "insensitive" } },
            { translation: { contains: raw, mode: "insensitive" } },
            { analysis: { contains: raw, mode: "insensitive" } },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: PER_TYPE_LIMIT,
      }),
    ]);

    const results: SearchResult[] = [
      ...conversations.map((c) => ({
        type: "conversation" as const,
        id: c.id,
        title: c.title,
        snippet: truncate(c.title),
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        meta: { messageCount: c._count.messages },
      })),
      ...messages.map((m) => ({
        type: "message" as const,
        id: m.id,
        title: m.conversation?.title ?? "Conversation",
        snippet: truncate(m.content),
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.createdAt.toISOString(),
        meta: { role: m.role, conversationId: m.conversationId },
      })),
      ...files.map((f) => ({
        type: "file" as const,
        id: f.id,
        title: f.originalName,
        snippet:
          f.extractedText && f.extractedText.toLowerCase().includes(raw.toLowerCase())
            ? truncate(f.extractedText)
            : truncate(f.originalName),
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.createdAt.toISOString(),
        meta: { mimeType: f.mimeType, size: f.size },
      })),
      ...voiceSessions.map((v) => ({
        type: "audio" as const,
        id: v.id,
        title: v.translation ? "Voice session (translated)" : "Voice session",
        snippet: truncate(v.transcript),
        createdAt: v.createdAt.toISOString(),
        updatedAt: v.updatedAt.toISOString(),
        meta: { sourceLang: v.sourceLang, targetLang: v.targetLang },
      })),
    ];

    res.json({ query: raw, results });
  } catch (error: any) {
    logger.error("Global search error:", error);
    res.status(500).json({ error: "Search failed — try again." });
  }
}
