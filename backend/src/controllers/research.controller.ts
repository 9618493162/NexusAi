import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { prisma } from "../config/database";
import {
  listResearch,
  getResearch,
  createResearch,
  deleteResearch,
  runResearch,
} from "../services/research.service";

export async function list(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const items = await listResearch(req.user!.userId);
    res.json({ research: items });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Could not load research sessions" });
  }
}

export async function get(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const item = await getResearch(req.user!.userId, String(req.params.id || ""));
    if (!item) {
      res.status(404).json({ error: "Research session not found" });
      return;
    }
    res.json(item);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Could not load research session" });
  }
}

export async function create(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { query, mode } = req.body || {};
    if (!query || typeof query !== "string" || !query.trim()) {
      res.status(400).json({ error: "A research question is required" });
      return;
    }
    const item = await createResearch(req.user!.userId, query, typeof mode === "string" ? mode : "quick");
    res.status(201).json(item);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Could not start research" });
  }
}

export async function remove(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const deleted = await deleteResearch(req.user!.userId, String(req.params.id || ""));
    if (!deleted) {
      res.status(404).json({ error: "Research session not found" });
      return;
    }
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Could not delete research session" });
  }
}

/**
 * Run a research session, streaming real status + AI synthesis over SSE.
 * The session must exist and belong to the caller.
 */
export async function run(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const id = String(req.params.id || "");

  const item = await getResearch(userId, id);
  if (!item) {
    res.status(404).json({ error: "Research session not found" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send("status", { stage: "starting" });

  try {
    await runResearch(userId, id, item.query, item.mode || "quick", (e) => send(e.type, e));
  } catch (error: any) {
    await prismaMarkFailed(id, error?.message || "Research failed");
    send("error", { message: error?.message || "Research failed" });
  } finally {
    res.end();
  }
}

async function prismaMarkFailed(id: string, message: string): Promise<void> {
  try {
    await prisma.research.update({
      where: { id },
      data: { status: "failed", error: message.slice(0, 500) },
    });
  } catch {
    /* best-effort */
  }
}
