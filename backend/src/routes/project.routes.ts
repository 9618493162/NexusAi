import { Router } from "express";
import * as projectController from "../controllers/project.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

// Projects
router.get("/", authMiddleware, projectController.listProjects);
router.post("/", authMiddleware, projectController.createProjectValidators, projectController.createProject);
router.get("/:id", authMiddleware, projectController.getProject);
router.patch("/:id", authMiddleware, projectController.updateProjectValidators, projectController.updateProject);
router.delete("/:id", authMiddleware, projectController.deleteProject);

// Invitations & members
router.post("/:id/invitations", authMiddleware, projectController.inviteValidators, projectController.inviteMember);
router.post("/invitations/:invitationId/respond", authMiddleware, projectController.respondInviteValidators, projectController.respondToInvitation);
router.delete("/:id/invitations/:invitationId", authMiddleware, projectController.cancelInvitation);
router.patch("/:id/members/:userId", authMiddleware, projectController.changeRoleValidators, projectController.changeMemberRole);
router.delete("/:id/members/:userId", authMiddleware, projectController.removeMember);

// Linked files & conversations
router.post("/:id/files", authMiddleware, projectController.addFile);
router.delete("/:id/files/:fileId", authMiddleware, projectController.removeFile);
router.post("/:id/conversations", authMiddleware, projectController.addConversation);
router.delete("/:id/conversations/:conversationId", authMiddleware, projectController.removeConversation);

// Notes
router.post("/:id/notes", authMiddleware, projectController.noteValidators, projectController.createNote);
router.patch("/:id/notes/:noteId", authMiddleware, projectController.noteValidators, projectController.updateNote);
router.delete("/:id/notes/:noteId", authMiddleware, projectController.deleteNote);

// Tasks
router.post("/:id/tasks", authMiddleware, projectController.createTaskValidators, projectController.createTask);
router.patch("/:id/tasks/:taskId", authMiddleware, projectController.updateTaskValidators, projectController.updateTask);
router.delete("/:id/tasks/:taskId", authMiddleware, projectController.deleteTask);

// Project AI
router.post("/:id/ask", authMiddleware, projectController.askValidators, projectController.askProject);

export default router;
