import { Router } from "express";
import * as usageController from "../controllers/usage.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.get("/", authMiddleware, usageController.getUsage);

export default router;
