import { Router } from "express";
import * as providersController from "../controllers/providers.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.get("/status", authMiddleware, providersController.getStatus);
router.get("/models", authMiddleware, providersController.getModelCatalogHandler);
router.get("/nvidia/health", authMiddleware, providersController.getNvidiaHealthHandler);

export default router;
