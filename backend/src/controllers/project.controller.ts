import { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import * as projectService from "../services/project.service";
import * as chatService from "../services/chat.service";
import { logger } from "../config/logger";

/* ── Validators ─────────────────────────────────────────────────────── */

export const createProjectValidators = [
  body("name").trim().isLength({ min: 2, max: 80 }).withMessage("Project name is required (2–80 chars)"),
  body("description").optional().isString().isLength({ max: 400 }),
  body("icon").optional().isString().isLength({ max: 4 }),
];

export const updateProjectValidators = [
  body("name").optional().trim().isLength({ min: 2, max: 80 }),
  body("description").optional().isString().isLength({ max: 400 }),
  body("icon").optional().isString().isLength({ max: 4 }),
];

export const inviteValidators = [
  body("email").isEmail().withMessage("Enter a valid email address"),
  body("role").optional().isIn(["editor", "viewer"]),
];

export const respondInviteValidators = [body("accept").isBoolean()];

export const changeRoleValidators = [body("role").isIn(["editor", "viewer"]).withMessage("Role must be editor or viewer")];

export const noteValidators = [
  body("title").optional().trim().isLength({ max: 120 }),
  body("content").optional().isString(),
];

export const createTaskValidators = [
  body("title").trim().isLength({ min: 1, max: 160 }).withMessage("Task title is required"),
  body("status").optional().isIn(["todo", "in_progress", "done"]),
  body("assigneeId").optional({ nullable: true }).isUUID(),
];

export const updateTaskValidators = [
  body("title").optional().trim().isLength({ min: 1, max: 160 }),
  body("status").optional().isIn(["todo", "in_progress", "done"]),
  body("assigneeId").optional({ nullable: true }).isUUID(),
];

export const askValidators = [
  body("message").trim().isLength({ min: 1 }).withMessage("Message is required"),
  body("model").optional().isString(),
];

function hasErrors(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: "Validation failed", details: errors.array() });
    return true;
  }
  return false;
}

/** Map a service result ({status, error} | {status, ...data}) to an HTTP response. */
function respond(res: Response, result: any) {
  if (result.status >= 400) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  const { status, ...data } = result;
  res.status(status).json(data);
}

/* ── Projects ───────────────────────────────────────────────────────── */

export async function listProjects(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const [projects, invitations] = await Promise.all([
      projectService.listProjectsForUser(userId),
      projectService.listInvitationsForUser(req.user!.email || ""),
    ]);
    res.json({ projects, invitations });
  } catch (error: any) {
    logger.error("List projects error:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function createProject(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (hasErrors(req, res)) return;
  try {
    const { name, description, icon } = req.body;
    const project = await projectService.createProject(req.user!.userId, { name, description, icon }, req.user!.name || undefined);
    res.status(201).json({ project });
  } catch (error: any) {
    logger.error("Create project error:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function getProject(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await projectService.getProject(req.user!.userId, String(req.params.id));
    if (!result) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json(result);
  } catch (error: any) {
    logger.error("Get project error:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function updateProject(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (hasErrors(req, res)) return;
  try {
    const result = await projectService.updateProject(req.user!.userId, String(req.params.id), req.body, req.user!.name || undefined);
    respond(res, result);
  } catch (error: any) {
    logger.error("Update project error:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function deleteProject(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await projectService.deleteProject(req.user!.userId, String(req.params.id), req.user!.name || undefined);
    respond(res, result);
  } catch (error: any) {
    logger.error("Delete project error:", error);
    res.status(500).json({ error: error.message });
  }
}

/* ── Invitations & members ──────────────────────────────────────────── */

export async function inviteMember(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (hasErrors(req, res)) return;
  try {
    const result = await projectService.inviteMember(req.user!.userId, String(req.params.id), req.body, req.user!.name || undefined);
    respond(res, result);
  } catch (error: any) {
    logger.error("Invite member error:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function respondToInvitation(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (hasErrors(req, res)) return;
  try {
    const result = await projectService.respondToInvitation(
      req.user!.userId,
      req.user!.email || "",
      String(req.params.invitationId),
      req.body.accept
    );
    respond(res, result);
  } catch (error: any) {
    logger.error("Respond invitation error:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function cancelInvitation(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await projectService.cancelInvitation(
      req.user!.userId,
      String(req.params.id),
      String(req.params.invitationId),
      req.user!.name || undefined
    );
    respond(res, result);
  } catch (error: any) {
    logger.error("Cancel invitation error:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function changeMemberRole(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (hasErrors(req, res)) return;
  try {
    const result = await projectService.changeMemberRole(
      req.user!.userId,
      String(req.params.id),
      String(req.params.userId),
      req.body.role,
      req.user!.name || undefined
    );
    respond(res, result);
  } catch (error: any) {
    logger.error("Change member role error:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function removeMember(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await projectService.removeMember(
      req.user!.userId,
      String(req.params.id),
      String(req.params.userId),
      req.user!.name || undefined
    );
    respond(res, result);
  } catch (error: any) {
    logger.error("Remove member error:", error);
    res.status(500).json({ error: error.message });
  }
}

/* ── Linked files & conversations ───────────────────────────────────── */

export async function addFile(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await projectService.addProjectFile(req.user!.userId, String(req.params.id), String(req.body.fileId), req.user!.name || undefined);
    respond(res, result);
  } catch (error: any) {
    logger.error("Add project file error:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function removeFile(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await projectService.removeProjectFile(
      req.user!.userId,
      String(req.params.id),
      String(req.params.fileId),
      req.user!.name || undefined
    );
    respond(res, result);
  } catch (error: any) {
    logger.error("Remove project file error:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function addConversation(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await projectService.addProjectConversation(
      req.user!.userId,
      String(req.params.id),
      String(req.body.conversationId),
      req.user!.name || undefined
    );
    respond(res, result);
  } catch (error: any) {
    logger.error("Add project conversation error:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function removeConversation(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await projectService.removeProjectConversation(
      req.user!.userId,
      String(req.params.id),
      String(req.params.conversationId),
      req.user!.name || undefined
    );
    respond(res, result);
  } catch (error: any) {
    logger.error("Remove project conversation error:", error);
    res.status(500).json({ error: error.message });
  }
}

/* ── Notes ──────────────────────────────────────────────────────────── */

export async function createNote(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (hasErrors(req, res)) return;
  try {
    const result = await projectService.createNote(
      req.user!.userId,
      String(req.params.id),
      { title: req.body.title || "Untitled note", content: req.body.content || "" },
      req.user!.name || undefined
    );
    respond(res, result);
  } catch (error: any) {
    logger.error("Create note error:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function updateNote(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (hasErrors(req, res)) return;
  try {
    const result = await projectService.updateNote(
      req.user!.userId,
      String(req.params.id),
      String(req.params.noteId),
      req.body,
      req.user!.name || undefined
    );
    respond(res, result);
  } catch (error: any) {
    logger.error("Update note error:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function deleteNote(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await projectService.deleteNote(req.user!.userId, String(req.params.id), String(req.params.noteId), req.user!.name || undefined);
    respond(res, result);
  } catch (error: any) {
    logger.error("Delete note error:", error);
    res.status(500).json({ error: error.message });
  }
}

/* ── Tasks ──────────────────────────────────────────────────────────── */

export async function createTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (hasErrors(req, res)) return;
  try {
    const result = await projectService.createTask(req.user!.userId, String(req.params.id), req.body, req.user!.name || undefined);
    respond(res, result);
  } catch (error: any) {
    logger.error("Create task error:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function updateTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (hasErrors(req, res)) return;
  try {
    const result = await projectService.updateTask(
      req.user!.userId,
      String(req.params.id),
      String(req.params.taskId),
      req.body,
      req.user!.name || undefined
    );
    respond(res, result);
  } catch (error: any) {
    logger.error("Update task error:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function deleteTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await projectService.deleteTask(req.user!.userId, String(req.params.id), String(req.params.taskId), req.user!.name || undefined);
    respond(res, result);
  } catch (error: any) {
    logger.error("Delete task error:", error);
    res.status(500).json({ error: error.message });
  }
}

/* ── Project AI — real chat over member-authorized content ──────────── */

export async function askProject(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (hasErrors(req, res)) return;
  try {
    const projectId = String(req.params.id);
    const { message, model } = req.body;

    // Membership gate first — viewers may ask, non-members get nothing.
    const membership = await projectService.getMembership(projectId, req.user!.userId);
    if (!membership) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const context = await projectService.buildProjectContext(projectId);
    const contextBlock = context
      ? `You are NexusAI, a collaborative workspace assistant. Answer using ONLY the project context below when it is relevant; otherwise say the answer isn't in the project's knowledge.\n\n--- PROJECT KNOWLEDGE ---\n${context}\n--- END PROJECT KNOWLEDGE ---`
      : "You are NexusAI, a collaborative workspace assistant. This project has no notes or file content yet, so answer generally.";

    const messages: Array<{ role: "system" | "user"; content: string }> = [
      { role: "system", content: contextBlock },
      { role: "user", content: message },
    ];

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let full = "";
    for await (const chunk of chatService.streamChat(messages, model, req.user!.userId, "projects")) {
      full += chunk;
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    }

    await projectService.logActivity(projectId, { userId: req.user!.userId, name: req.user!.name || undefined }, "ai_asked", message.slice(0, 80));
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error: any) {
    logger.error("Project AI stream error:", error);
    res.write(`data: ${JSON.stringify({ error: error.message || "Project AI failed" })}\n\n`);
    res.end();
  }
}
