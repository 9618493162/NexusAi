import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import * as researchController from "../controllers/research.controller";

const router = Router();

// Research & Deep Search — real web + personal-file sources, AI synthesis
// with citations. Every route is ownership-scoped to the authenticated user.
router.get("/", authMiddleware, researchController.list);
router.post("/", authMiddleware, researchController.create);
router.get("/:id", authMiddleware, researchController.get);
router.post("/:id/run", authMiddleware, researchController.run);
router.delete("/:id", authMiddleware, researchController.remove);

export default router;
