import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { prisma } from "../config/database";
import {
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  listAgentRuns,
  runAgent,
} from "../services/agents.service";

export async function list(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const items = await listAgents(req.user!.userId);
    res.json({ agents: items });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Could not load agents" });
  }
}

export async function get(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const item = await getAgent(req.user!.userId, String(req.params.id || ""));
    if (!item) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json(item);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Could not load agent" });
  }
}

export async function create(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const item = await createAgent(req.user!.userId, req.body || {});
    res.status(201).json(item);
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "Could not create agent" });
  }
}

export async function update(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const item = await updateAgent(req.user!.userId, String(req.params.id || ""), req.body || {});
    if (!item) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json(item);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Could not update agent" });
  }
}

export async function remove(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const deleted = await deleteAgent(req.user!.userId, String(req.params.id || ""));
    if (!deleted) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Could not delete agent" });
  }
}

export async function runs(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const items = await listAgentRuns(req.user!.userId, String(req.params.id || ""));
    if (!items) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json({ runs: items });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Could not load agent runs" });
  }
}

/**
 * Run an agent, streaming real tool events + AI output over SSE.
 * The agent must exist and belong to the caller.
 */
export async function run(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const id = String(req.params.id || "");

  const agent = await getAgent(userId, id);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
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
    await runAgent(userId, id, String(req.body?.input || ""), (e) => send(e.type, e));
  } catch (error: any) {
    try {
      await prisma.agentRun.create({
        data: {
          agentId: id,
          userId,
          input: String(req.body?.input || "").slice(0, 10000),
          status: "failed",
          error: (error?.message || "Agent run failed").slice(0, 500),
        },
      });
    } catch {
      /* best-effort */
    }
    send("error", { message: error?.message || "Agent run failed" });
  } finally {
    res.end();
  }
}
