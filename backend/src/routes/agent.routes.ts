import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import * as agentController from "../controllers/agent.controller";

const router = Router();

// AI Agents Studio — user-defined agents with real web/file tools and streamed
// AI runs. Every route is ownership-scoped to the authenticated user.
router.get("/", authMiddleware, agentController.list);
router.post("/", authMiddleware, agentController.create);
router.get("/:id/runs", authMiddleware, agentController.runs);
router.post("/:id/run", authMiddleware, agentController.run);
router.get("/:id", authMiddleware, agentController.get);
router.patch("/:id", authMiddleware, agentController.update);
router.delete("/:id", authMiddleware, agentController.remove);

export default router;
