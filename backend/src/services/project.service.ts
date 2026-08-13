import { prisma } from "../config/database";
import { sendProjectInvitationEmail } from "../utils/email";
import { logger } from "../config/logger";

/**
 * Collaborative workspace service. Every read/write is scoped through
 * ProjectMember: a user can only see projects they belong to, and write
 * actions require editor (or owner). Role checks happen HERE, server-side —
 * the frontend can never escalate its own access.
 *
 * Roles: owner > editor > viewer. Member management (invite/role/remove) is
 * owner-only; content (files, conversations, notes, tasks) is editor+;
 * viewers read and can use the project AI on authorized content only.
 */

export type ProjectRole = "owner" | "editor" | "viewer";

const WRITE_ROLES: ProjectRole[] = ["owner", "editor"];

/** The caller's membership row, or null when not a member. */
export async function getMembership(projectId: string, userId: string) {
  return prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    include: { user: { select: { email: true } } },
  });
}

function canWrite(role?: string | null): boolean {
  return !!role && WRITE_ROLES.includes(role as ProjectRole);
}

/** Projects the user belongs to, with real counts and their own role. */
export async function listProjectsForUser(userId: string) {
  return prisma.project.findMany({
    where: { members: { some: { userId } } },
    orderBy: { updatedAt: "desc" },
    include: {
      members: {
        select: { role: true, user: { select: { id: true, name: true, email: true, avatar: true } } },
      },
      _count: { select: { files: true, conversations: true, notes: true, tasks: true, members: true } },
    },
  });
}

/** Pending invitations addressed to this user's email. */
export async function listInvitationsForUser(email: string) {
  return prisma.projectInvitation.findMany({
    where: { email, status: "pending" },
    orderBy: { createdAt: "desc" },
    include: { project: { select: { id: true, name: true, icon: true, description: true } } },
  });
}

export async function getProject(userId: string, projectId: string) {
  const membership = await getMembership(projectId, userId);
  if (!membership) return null;

  const [project, activity] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: {
          orderBy: { createdAt: "asc" },
          include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
        },
        invitations: {
          where: { status: "pending" },
          orderBy: { createdAt: "desc" },
          select: { id: true, email: true, role: true, createdAt: true },
        },
        files: {
          orderBy: { createdAt: "desc" },
          include: { file: { select: { id: true, originalName: true, mimeType: true, size: true, extractedText: true, createdAt: true } } },
        },
        conversations: {
          orderBy: { createdAt: "desc" },
          include: { conversation: { select: { id: true, title: true, createdAt: true, updatedAt: true } } },
        },
        notes: { orderBy: { updatedAt: "desc" } },
        tasks: { orderBy: { updatedAt: "desc" } },
        _count: { select: { files: true, conversations: true, notes: true, tasks: true, members: true } },
      },
    }),
    prisma.projectActivity.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { name: true, avatar: true } } },
    }),
  ]);

  return { project: { ...project, myRole: membership.role }, activity };
}

/** Record a real event on the project timeline. */
export async function logActivity(projectId: string, actor: { userId?: string; name?: string }, type: string, detail?: string) {
  return prisma.projectActivity.create({
    data: {
      projectId,
      userId: actor.userId || null,
      actorName: actor.name || null,
      type,
      detail: detail || null,
    },
  });
}

export async function createProject(userId: string, data: { name: string; description?: string; icon?: string }, actorName?: string) {
  const project = await prisma.project.create({
    data: {
      name: data.name.trim(),
      description: data.description?.trim() || null,
      icon: data.icon?.trim() || null,
      ownerId: userId,
      members: { create: { userId, role: "owner" } },
    },
  });
  await logActivity(project.id, { userId, name: actorName }, "created", project.name);
  return project;
}

export async function updateProject(userId: string, projectId: string, data: { name?: string; description?: string; icon?: string }, actorName?: string) {
  const membership = await getMembership(projectId, userId);
  if (!membership || membership.role !== "owner") return { status: 403 as const, error: "Only the project owner can edit project details" };
  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.description !== undefined ? { description: data.description.trim() || null } : {}),
      ...(data.icon !== undefined ? { icon: data.icon.trim() || null } : {}),
    },
  });
  await logActivity(projectId, { userId, name: actorName }, "project_updated", project.name);
  return { status: 200 as const, project };
}

export async function deleteProject(userId: string, projectId: string, actorName?: string) {
  const membership = await getMembership(projectId, userId);
  if (!membership || membership.role !== "owner") return { status: 403 as const, error: "Only the project owner can delete it" };
  await prisma.project.delete({ where: { id: projectId } });
  return { status: 200 as const };
}

/* ── Invitations & members ──────────────────────────────────────────── */

export async function inviteMember(userId: string, projectId: string, data: { email: string; role: string }, actorName?: string) {
  const membership = await getMembership(projectId, userId);
  if (!membership || membership.role !== "owner") return { status: 403 as const, error: "Only the project owner can invite members" };

  const email = data.email.trim().toLowerCase();
  const role = data.role === "viewer" ? "viewer" : "editor";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: 400 as const, error: "Enter a valid email address" };
  if (email === (membership.user?.email ?? "").toLowerCase()) return { status: 400 as const, error: "You can't invite yourself" };

  const target = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (target) {
    const already = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: target.id } },
    });
    if (already) return { status: 400 as const, error: "That user is already a member of this project" };
  }
  const pending = await prisma.projectInvitation.findFirst({ where: { projectId, email, status: "pending" } });
  if (pending) return { status: 400 as const, error: "An invitation to that email is already pending" };

  const invitation = await prisma.projectInvitation.create({
    data: { projectId, email, role, invitedById: userId },
  });
  await logActivity(projectId, { userId, name: actorName }, "member_invited", email);

  // Real invitation email through the existing Resend/SMTP pipeline
  // (best-effort — a delivery failure never blocks the invite itself).
  try {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
    await sendProjectInvitationEmail(email, project?.name || "a project", actorName || null, role);
  } catch (error) {
    logger.error("Project invitation email send failed (invite kept):", error);
  }

  return { status: 201 as const, invitation };
}

/** Accept or decline a pending invitation addressed to this user's email. */
export async function respondToInvitation(userId: string, userEmail: string, invitationId: string, accept: boolean) {
  const invitation = await prisma.projectInvitation.findUnique({ where: { id: invitationId } });
  if (!invitation || invitation.status !== "pending") return { status: 404 as const, error: "Invitation not found or already responded to" };
  if (invitation.email.toLowerCase() !== (userEmail || "").toLowerCase()) return { status: 403 as const, error: "This invitation isn't for you" };

  if (accept) {
    const already = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: invitation.projectId, userId } },
    });
    if (!already) {
      // The invite's role is never "owner" — the inviter can't grant ownership.
      await prisma.projectMember.create({
        data: { projectId: invitation.projectId, userId, role: invitation.role === "owner" ? "editor" : invitation.role },
      });
    }
    await prisma.projectInvitation.update({ where: { id: invitationId }, data: { status: "accepted", respondedAt: new Date() } });
    await logActivity(invitation.projectId, { userId }, "member_joined", userEmail);
  } else {
    await prisma.projectInvitation.update({ where: { id: invitationId }, data: { status: "declined", respondedAt: new Date() } });
  }
  return { status: 200 as const };
}

export async function cancelInvitation(userId: string, projectId: string, invitationId: string, actorName?: string) {
  const membership = await getMembership(projectId, userId);
  if (!membership || membership.role !== "owner") return { status: 403 as const, error: "Only the project owner can manage invitations" };
  const invitation = await prisma.projectInvitation.findUnique({ where: { id: invitationId } });
  if (!invitation || invitation.projectId !== projectId) return { status: 404 as const, error: "Invitation not found" };
  if (invitation.status !== "pending") return { status: 400 as const, error: "Invitation was already responded to" };
  await prisma.projectInvitation.update({ where: { id: invitationId }, data: { status: "declined", respondedAt: new Date() } });
  await logActivity(projectId, { userId, name: actorName }, "invitation_cancelled", invitation.email);
  return { status: 200 as const };
}

export async function changeMemberRole(userId: string, projectId: string, targetUserId: string, role: string, actorName?: string) {
  const membership = await getMembership(projectId, userId);
  if (!membership || membership.role !== "owner") return { status: 403 as const, error: "Only the project owner can change roles" };
  const target = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: targetUserId } },
  });
  if (!target) return { status: 404 as const, error: "Member not found" };
  if (target.role === "owner") return { status: 400 as const, error: "The owner's role can't be changed" };
  const nextRole = role === "viewer" ? "viewer" : "editor";
  await prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId: targetUserId } },
    data: { role: nextRole },
  });
  await logActivity(projectId, { userId, name: actorName }, "role_changed", `${targetUserId} → ${nextRole}`);
  return { status: 200 as const };
}

export async function removeMember(userId: string, projectId: string, targetUserId: string, actorName?: string) {
  const membership = await getMembership(projectId, userId);
  if (!membership || membership.role !== "owner") return { status: 403 as const, error: "Only the project owner can remove members" };
  const target = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: targetUserId } },
  });
  if (!target) return { status: 404 as const, error: "Member not found" };
  if (target.role === "owner") return { status: 400 as const, error: "The owner can't be removed" };
  await prisma.projectMember.delete({ where: { projectId_userId: { projectId, userId: targetUserId } } });
  await logActivity(projectId, { userId, name: actorName }, "member_removed", targetUserId);
  return { status: 200 as const };
}

/* ── Linked resources (editor+ to add/remove; read follows membership) ── */

export async function addProjectFile(userId: string, projectId: string, fileId: string, actorName?: string) {
  const membership = await getMembership(projectId, userId);
  if (!membership) return { status: 404 as const, error: "Project not found" };
  if (!canWrite(membership.role)) return { status: 403 as const, error: "Editors and above can add files" };

  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file || file.userId !== userId) return { status: 404 as const, error: "File not found" };
  const exists = await prisma.projectFile.findUnique({
    where: { projectId_fileId: { projectId, fileId } },
  });
  if (exists) return { status: 400 as const, error: "That file is already in the project" };

  const link = await prisma.projectFile.create({ data: { projectId, fileId, addedById: userId } });
  await logActivity(projectId, { userId, name: actorName }, "file_added", file.originalName);
  return { status: 201 as const, link };
}

export async function removeProjectFile(userId: string, projectId: string, fileId: string, actorName?: string) {
  const membership = await getMembership(projectId, userId);
  if (!membership) return { status: 404 as const, error: "Project not found" };
  if (!canWrite(membership.role)) return { status: 403 as const, error: "Editors and above can remove files" };
  const link = await prisma.projectFile.findUnique({ where: { projectId_fileId: { projectId, fileId } } });
  if (!link) return { status: 404 as const, error: "File not in project" };
  await prisma.projectFile.delete({ where: { id: link.id } });
  await logActivity(projectId, { userId, name: actorName }, "file_removed", fileId);
  return { status: 200 as const };
}

export async function addProjectConversation(userId: string, projectId: string, conversationId: string, actorName?: string) {
  const membership = await getMembership(projectId, userId);
  if (!membership) return { status: 404 as const, error: "Project not found" };
  if (!canWrite(membership.role)) return { status: 403 as const, error: "Editors and above can add conversations" };

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.userId !== userId) return { status: 404 as const, error: "Conversation not found" };
  const exists = await prisma.projectConversation.findUnique({
    where: { projectId_conversationId: { projectId, conversationId } },
  });
  if (exists) return { status: 400 as const, error: "That conversation is already in the project" };

  const link = await prisma.projectConversation.create({ data: { projectId, conversationId, addedById: userId } });
  await logActivity(projectId, { userId, name: actorName }, "conversation_added", conversation.title);
  return { status: 201 as const, link };
}

export async function removeProjectConversation(userId: string, projectId: string, conversationId: string, actorName?: string) {
  const membership = await getMembership(projectId, userId);
  if (!membership) return { status: 404 as const, error: "Project not found" };
  if (!canWrite(membership.role)) return { status: 403 as const, error: "Editors and above can remove conversations" };
  const link = await prisma.projectConversation.findUnique({ where: { projectId_conversationId: { projectId, conversationId } } });
  if (!link) return { status: 404 as const, error: "Conversation not in project" };
  await prisma.projectConversation.delete({ where: { id: link.id } });
  await logActivity(projectId, { userId, name: actorName }, "conversation_removed", conversationId);
  return { status: 200 as const };
}

/* ── Notes (editor+ writes, real persistence) ────────────────────────── */

export async function listNotes(projectId: string) {
  return prisma.projectNote.findMany({ where: { projectId }, orderBy: { updatedAt: "desc" } });
}

export async function createNote(userId: string, projectId: string, data: { title: string; content: string }, actorName?: string) {
  const membership = await getMembership(projectId, userId);
  if (!membership) return { status: 404 as const, error: "Project not found" };
  if (!canWrite(membership.role)) return { status: 403 as const, error: "Editors and above can create notes" };
  const note = await prisma.projectNote.create({
    data: { projectId, title: data.title.trim() || "Untitled note", content: data.content, createdById: userId },
  });
  await logActivity(projectId, { userId, name: actorName }, "note_added", note.title);
  return { status: 201 as const, note };
}

export async function updateNote(userId: string, projectId: string, noteId: string, data: { title?: string; content?: string }, actorName?: string) {
  const membership = await getMembership(projectId, userId);
  if (!membership) return { status: 404 as const, error: "Project not found" };
  if (!canWrite(membership.role)) return { status: 403 as const, error: "Editors and above can edit notes" };
  const note = await prisma.projectNote.findFirst({ where: { id: noteId, projectId } });
  if (!note) return { status: 404 as const, error: "Note not found" };
  const updated = await prisma.projectNote.update({
    where: { id: noteId },
    data: {
      ...(data.title !== undefined ? { title: data.title.trim() || "Untitled note" } : {}),
      ...(data.content !== undefined ? { content: data.content } : {}),
    },
  });
  await logActivity(projectId, { userId, name: actorName }, "note_updated", updated.title);
  return { status: 200 as const, note: updated };
}

export async function deleteNote(userId: string, projectId: string, noteId: string, actorName?: string) {
  const membership = await getMembership(projectId, userId);
  if (!membership) return { status: 404 as const, error: "Project not found" };
  if (!canWrite(membership.role)) return { status: 403 as const, error: "Editors and above can delete notes" };
  const note = await prisma.projectNote.findFirst({ where: { id: noteId, projectId } });
  if (!note) return { status: 404 as const, error: "Note not found" };
  await prisma.projectNote.delete({ where: { id: noteId } });
  await logActivity(projectId, { userId, name: actorName }, "note_deleted", note.title);
  return { status: 200 as const };
}

/* ── Tasks (kanban, editor+ writes) ──────────────────────────────────── */

export async function listTasks(projectId: string) {
  return prisma.projectTask.findMany({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
    include: { assignee: { select: { id: true, name: true, email: true } } },
  });
}

export async function createTask(userId: string, projectId: string, data: { title: string; status?: string; assigneeId?: string }, actorName?: string) {
  const membership = await getMembership(projectId, userId);
  if (!membership) return { status: 404 as const, error: "Project not found" };
  if (!canWrite(membership.role)) return { status: 403 as const, error: "Editors and above can create tasks" };
  const status = ["todo", "in_progress", "done"].includes(data.status || "") ? data.status! : "todo";
  if (data.assigneeId) {
    const assignee = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: data.assigneeId } },
    });
    if (!assignee) return { status: 400 as const, error: "Assignee must be a project member" };
  }
  const task = await prisma.projectTask.create({
    data: {
      projectId,
      title: data.title.trim(),
      status,
      assigneeId: data.assigneeId || null,
      createdById: userId,
    },
  });
  await logActivity(projectId, { userId, name: actorName }, "task_added", task.title);
  return { status: 201 as const, task };
}

export async function updateTask(userId: string, projectId: string, taskId: string, data: { title?: string; status?: string; assigneeId?: string | null }, actorName?: string) {
  const membership = await getMembership(projectId, userId);
  if (!membership) return { status: 404 as const, error: "Project not found" };
  if (!canWrite(membership.role)) return { status: 403 as const, error: "Editors and above can edit tasks" };
  const task = await prisma.projectTask.findFirst({ where: { id: taskId, projectId } });
  if (!task) return { status: 404 as const, error: "Task not found" };

  const patch: Record<string, unknown> = {};
  if (data.title !== undefined) patch.title = data.title.trim();
  if (data.assigneeId !== undefined) {
    if (data.assigneeId) {
      const assignee = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: data.assigneeId } },
      });
      if (!assignee) return { status: 400 as const, error: "Assignee must be a project member" };
      patch.assigneeId = data.assigneeId;
    } else {
      patch.assigneeId = null;
    }
  }
  if (data.status !== undefined) {
    if (!["todo", "in_progress", "done"].includes(data.status)) return { status: 400 as const, error: "Invalid task status" };
    patch.status = data.status;
    if (data.status !== task.status) {
      await logActivity(projectId, { userId, name: actorName }, "task_moved", `${task.title} → ${data.status.replace("_", " ")}`);
    }
  }

  const updated = await prisma.projectTask.update({ where: { id: taskId }, data: patch });
  return { status: 200 as const, task: updated };
}

export async function deleteTask(userId: string, projectId: string, taskId: string, actorName?: string) {
  const membership = await getMembership(projectId, userId);
  if (!membership) return { status: 404 as const, error: "Project not found" };
  if (!canWrite(membership.role)) return { status: 403 as const, error: "Editors and above can delete tasks" };
  const task = await prisma.projectTask.findFirst({ where: { id: taskId, projectId } });
  if (!task) return { status: 404 as const, error: "Task not found" };
  await prisma.projectTask.delete({ where: { id: taskId } });
  await logActivity(projectId, { userId, name: actorName }, "task_deleted", task.title);
  return { status: 200 as const };
}

/* ── Project AI — real chat over member-authorized content ───────────── */

const NOTE_SLICE = 2500;
const FILE_SLICE = 6000;
// Budgets are kept separate so long notes can never starve linked files out
// of the context (and vice versa). Files get the larger share — extracted
// text is the densest source of factual grounding.
const NOTE_BUDGET = 9000;
const FILE_BUDGET = 15000;

/**
 * Assemble the project's authorized context (notes + linked files' extracted
 * text) and answer through the existing chat pipeline (save=false — nothing
 * is persisted). Only content from files the project links is included, so
 * the model never sees anything a member couldn't read themselves. Files are
 * picked newest-first from the project's own link table — the file must have
 * been explicitly shared into the project by an editor for its text to be
 * eligible, so no foreign file can ever enter the context.
 */
export async function buildProjectContext(projectId: string): Promise<string> {
  const [notes, files] = await Promise.all([
    prisma.projectNote.findMany({ where: { projectId }, orderBy: { updatedAt: "desc" }, take: 12 }),
    prisma.projectFile.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { file: { select: { originalName: true, mimeType: true, size: true, extractedText: true } } },
    }),
  ]);

  const parts: string[] = [];
  let noteUsed = 0;
  let fileUsed = 0;

  for (const note of notes) {
    const content = note.content.trim();
    if (!content) continue;
    const block = `NOTE: ${note.title}\n${content.slice(0, NOTE_SLICE)}`;
    noteUsed += block.length;
    if (noteUsed > NOTE_BUDGET) break; // per-category budget, not global
    parts.push(block);
  }
  for (const link of files) {
    const text = (link.file.extractedText || "").trim();
    if (!text || text === "File processing disabled") continue;
    const fileInfo = [link.file.originalName, link.file.mimeType, `${link.file.size} bytes`].filter(Boolean).join(" · ");
    const block = `FILE: ${fileInfo}\n${text.slice(0, FILE_SLICE)}`;
    fileUsed += block.length;
    if (fileUsed > FILE_BUDGET) break;
    parts.push(block);
  }

  return parts.join("\n\n---\n\n");
}
