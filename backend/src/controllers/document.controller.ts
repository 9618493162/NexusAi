import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { prisma } from "../config/database";
import { logger } from "../config/logger";
import {
  listDocuments,
  getDocument,
  listRevisions,
  createDocument,
  saveDocument,
  updateDocumentOutline,
  deleteDocument,
  generateOutline,
  generateDocument,
  buildContext,
  markdownToHtml,
  markdownToPptx,
} from "../services/document.service";
import { generateMagicSlides, magicSlidesConfigured } from "../services/magicslides.service";

export async function list(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const docs = await listDocuments(req.user!.userId);
    res.json({ documents: docs });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Could not load documents" });
  }
}

export async function get(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const doc = await getDocument(req.user!.userId, String(req.params.id || ""));
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.json(doc);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Could not load document" });
  }
}

export async function revisions(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const revs = await listRevisions(req.user!.userId, String(req.params.id || ""));
    if (!revs) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.json({ revisions: revs });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Could not load revisions" });
  }
}

export async function create(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { title, type, sourceType, sourceId, sourceName } = req.body || {};
    if (!title || typeof title !== "string" || !title.trim()) {
      res.status(400).json({ error: "A title is required" });
      return;
    }
    const doc = await createDocument(req.user!.userId, {
      title,
      type: typeof type === "string" ? type : "report",
      sourceType: typeof sourceType === "string" ? sourceType : null,
      sourceId: typeof sourceId === "string" ? sourceId : null,
      sourceName: typeof sourceName === "string" ? sourceName : null,
    });
    res.status(201).json(doc);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Could not create document" });
  }
}

export async function update(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { content, title, outline } = req.body || {};
    const id = String(req.params.id || "");
    if (outline !== undefined) {
      const doc = await updateDocumentOutline(req.user!.userId, id, String(outline));
      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }
      res.json(doc);
      return;
    }
    const doc = await saveDocument(
      req.user!.userId,
      id,
      typeof content === "string" ? content : "",
      typeof title === "string" ? title : undefined
    );
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.json(doc);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Could not save document" });
  }
}

export async function remove(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const deleted = await deleteDocument(req.user!.userId, String(req.params.id || ""));
    if (!deleted) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Could not delete document" });
  }
}

/** List the real resources a document can be built from. */
export async function sources(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const [research, meetings, files, conversations] = await Promise.all([
      prisma.research.findMany({
        where: { userId, status: "completed" },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, query: true, createdAt: true },
      }),
      prisma.meeting.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, title: true, createdAt: true },
      }),
      prisma.file.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, originalName: true, mimeType: true, createdAt: true },
      }),
      prisma.conversation.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: { id: true, title: true, updatedAt: true },
      }),
    ]);
    res.json({
      research: research.map((r) => ({ id: r.id, name: r.query, createdAt: r.createdAt })),
      meetings: meetings.map((m) => ({ id: m.id, name: m.title, createdAt: m.createdAt })),
      files: files.map((f) => ({ id: f.id, name: f.originalName, createdAt: f.createdAt })),
      conversations: conversations.map((c) => ({ id: c.id, name: c.title || "Conversation", createdAt: c.updatedAt })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Could not load sources" });
  }
}

/** Generate an outline for a topic (SSE). */
export async function outline(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const topic = typeof req.query.topic === "string" ? req.query.topic.trim() : "";
  const type = typeof req.query.type === "string" ? req.query.type : "report";
  if (!topic) {
    res.status(400).json({ error: "A topic is required" });
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  try {
    send("status", { stage: "outline" });
    const full = await generateOutline(userId, topic, type);
    send("done", { outline: full });
  } catch (error: any) {
    send("error", { message: error?.message || "Outline generation failed" });
  } finally {
    res.end();
  }
}

/** Generate the full document from topic + outline + real source context (SSE). */
export async function generate(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const id = String(req.params.id || "");
  const doc = await getDocument(userId, id);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const outline = typeof req.query.outline === "string" ? req.query.outline : doc.outline || "";

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    send("status", { stage: "context" });
    const context = await buildContext(userId, doc.sourceType, doc.sourceId);
    send("status", { stage: "writing" });
    let full = "";
    for await (const chunk of generateDocument(userId, doc.title, doc.type, outline, context)) {
      full += chunk;
      send("chunk", { text: chunk });
    }
    await saveDocument(userId, id, full);
    send("done", { content: full });
  } catch (error: any) {
    logger.error("Document generate error:", error);
    send("error", { message: error?.message || "Document generation failed" });
  } finally {
    res.end();
  }
}

/** Export as real files. */
/** Generate a real MagicSlides deck from the document (SSE). */
export async function magicSlides(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const id = String(req.params.id || "");
  const doc = await getDocument(userId, id);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  if (!magicSlidesConfigured()) {
    res.status(503).json({ error: "MagicSlides is not configured (MAGICSLIDES_API_KEY missing)" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    send("status", { stage: "magicslides" });
    const content = doc.content || "";
    // Feed the real document content when present so the deck reflects it;
    // otherwise a topic deck from the title.
    const result = await generateMagicSlides(doc.title, content, doc.type === "presentation" ? 10 : 6);
    await prisma.document.update({
      where: { id },
      data: {
        magicSlidesUrl: result.url,
        magicSlidesPdf: result.pdfUrl || null,
        magicSlidesId: result.pptId || null,
      },
    });
    send("done", { url: result.url, pdfUrl: result.pdfUrl, pptId: result.pptId });
  } catch (error: any) {
    logger.error("MagicSlides generation error:", error);
    send("error", { message: error?.message || "MagicSlides generation failed" });
  } finally {
    res.end();
  }
}

export async function exportDoc(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id || "");
    const fmt = String(req.params.format || "md");
    const doc = await getDocument(userId, id);
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    if (!doc.content.trim()) {
      res.status(400).json({ error: "This document has no content yet — generate it first." });
      return;
    }
    const base = doc.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "document";

    if (fmt === "md") {
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(base)}.md"`);
      res.send(`# ${doc.title}\n\n${doc.content}`);
      return;
    }
    if (fmt === "html") {
      const html = markdownToHtml(doc.content, doc.title);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(base)}.html"`);
      res.send(html);
      return;
    }
    if (fmt === "pptx") {
      const buf = await markdownToPptx(doc.content, doc.title);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(base)}.pptx"`);
      res.send(Buffer.from(buf));
      return;
    }
    res.status(400).json({ error: "Unsupported export format. Use md, html or pptx." });
  } catch (error: any) {
    logger.error("Document export error:", error);
    res.status(500).json({ error: error?.message || "Export failed" });
  }
}
