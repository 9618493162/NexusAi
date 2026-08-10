import { Router } from "express";
import * as providersController from "../controllers/providers.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.get("/status", authMiddleware, providersController.getStatus);

export default router;
