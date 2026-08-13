import { Router } from "express";
import * as searchController from "../controllers/search.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

// Global search over the signed-in user's own conversations, messages, files
// and voice sessions. Results are scoped to the authenticated user only.
router.get("/", authMiddleware, searchController.globalSearch);

export default router;
