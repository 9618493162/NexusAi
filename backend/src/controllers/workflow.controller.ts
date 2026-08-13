import { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import * as workflowService from "../services/workflow.service";
import { readWorkflowAudio } from "../services/workflow.engine";
import { logger } from "../config/logger";

const graphValidators = [
  body("nodes").isArray().withMessage("nodes must be an array"),
  body("edges").isArray().withMessage("edges must be an array"),
];

export const createValidators = [
  body("name").trim().isLength({ min: 1, max: 120 }).withMessage("Workflow name is required"),
  ...graphValidators,
];

export const updateValidators = [
  body("name").optional().trim().isLength({ min: 1, max: 120 }),
  body("description").optional().isString(),
  ...graphValidators.map((v) => v.optional()),
];

export async function list(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const workflows = await workflowService.listWorkflows(req.user!.userId);
    res.json({ workflows });
  } catch (error: any) {
    logger.error("List workflows error:", error);
    res.status(500).json({ error: error.message || "Failed to load workflows" });
  }
}

export async function create(req: AuthenticatedRequest, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: "Validation failed", details: errors.array() });
    return;
  }
  try {
    const workflow = await workflowService.createWorkflow(req.user!.userId, req.body);
    res.status(201).json({ workflow });
  } catch (error: any) {
    logger.error("Create workflow error:", error);
    res.status(500).json({ error: error.message || "Failed to create workflow" });
  }
}

export async function get(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const workflow = await workflowService.getWorkflow(req.user!.userId, String(req.params.id));
    if (!workflow) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }
    res.json({ workflow });
  } catch (error: any) {
    logger.error("Get workflow error:", error);
    res.status(500).json({ error: error.message || "Failed to load workflow" });
  }
}

export async function update(req: AuthenticatedRequest, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: "Validation failed", details: errors.array() });
    return;
  }
  try {
    const workflow = await workflowService.updateWorkflow(req.user!.userId, String(req.params.id), req.body);
    if (!workflow) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }
    res.json({ workflow });
  } catch (error: any) {
    logger.error("Update workflow error:", error);
    res.status(500).json({ error: error.message || "Failed to update workflow" });
  }
}

export async function remove(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const workflow = await workflowService.deleteWorkflow(req.user!.userId, String(req.params.id));
    if (!workflow) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }
    res.json({ ok: true });
  } catch (error: any) {
    logger.error("Delete workflow error:", error);
    res.status(500).json({ error: error.message || "Failed to delete workflow" });
  }
}

export async function listRuns(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const runs = await workflowService.listRuns(req.user!.userId, String(req.params.id));
    res.json({ runs });
  } catch (error: any) {
    logger.error("List workflow runs error:", error);
    res.status(500).json({ error: error.message || "Failed to load runs" });
  }
}

/**
 * Runs a workflow with REAL execution, streaming each node state change over
 * SSE as it happens. The graph is loaded from the DB (the frontend can only
 * edit, never execute privileged operations).
 */
export async function run(req: AuthenticatedRequest, res: Response): Promise<void> {
  const workflow = await workflowService.getWorkflow(req.user!.userId, String(req.params.id));
  if (!workflow) {
    res.status(404).json({ error: "Workflow not found" });
    return;
  }

  const nodes = Array.isArray(workflow.nodes) ? (workflow.nodes as unknown as any[]) : [];
  const edges = Array.isArray(workflow.edges) ? (workflow.edges as unknown as any[]) : [];

  const validation = workflowService.validateWorkflow(nodes, edges);
  if (!validation.ok) {
    res.status(400).json({ error: "Workflow cannot run", details: validation.errors });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const send = (event: workflowService.WorkflowEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const startedAt = new Date();
  let runId: string | null = null;

  try {
    const result = await workflowService.executeWorkflow({
      userId: req.user!.userId,
      nodes,
      edges,
      onEvent: (event) => send(event),
    });
    const run = await workflowService.saveRun(req.user!.userId, workflow.id, {
      status: "completed",
      result: result.result,
      outputs: result.outputs,
      nodeStates: result.nodeStates,
      startedAt,
    });
    runId = run.id;
    send({ type: "workflow:completed", status: "completed", message: "Workflow completed", summary: result.result.slice(0, 300) });
    send({ type: "run:saved", runId: run.id });
  } catch (error: any) {
    logger.error("Workflow run error:", error);
    const message = error?.message || "Workflow failed";
    try {
      const run = await workflowService.saveRun(req.user!.userId, workflow.id, {
        status: "failed",
        result: "",
        outputs: {},
        nodeStates: {},
        error: message,
        startedAt,
      });
      runId = run.id;
    } catch (saveErr) {
      logger.error("Could not persist failed run:", saveErr);
    }
    send({ type: "workflow:failed", status: "failed", error: message });
    send({ type: "run:saved", runId: runId ?? "" });
  } finally {
    res.end();
  }
}

/** Stream a workflow run's generated TTS audio (ownership-scoped). */
export async function streamRunAudio(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const run = await workflowService.getRun(req.user!.userId, String(req.params.runId));
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    const outputs = (run.outputs || {}) as Record<string, any>;
    const tts = outputs[String(req.params.nodeId)];
    if (!tts || tts.type !== "tts" || !tts.audioPath) {
      res.status(404).json({ error: "Audio not found for this node" });
      return;
    }
    const audio = readWorkflowAudio(tts.audioPath);
    if (!audio) {
      res.status(404).json({ error: "Audio file is missing" });
      return;
    }
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", String(audio.length));
    res.send(audio);
  } catch (error: any) {
    logger.error("Stream workflow audio error:", error);
    res.status(500).json({ error: error.message || "Failed to stream audio" });
  }
}
