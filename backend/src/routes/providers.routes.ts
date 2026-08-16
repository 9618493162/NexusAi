import { Router } from "express";
import * as providersController from "../controllers/providers.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.get("/status", authMiddleware, providersController.getStatus);
router.get("/models", authMiddleware, providersController.getModelCatalogHandler);
router.get("/nvidia/health", authMiddleware, providersController.getNvidiaHealthHandler);

// Bring-Your-Own-Key — user-owned provider credentials (encrypted at rest).
router.get("/keys", authMiddleware, providersController.getKeys);
router.post("/keys", authMiddleware, providersController.addKey);
router.post("/keys/test", authMiddleware, providersController.testKey);
router.put("/keys/default", authMiddleware, providersController.setDefault);
router.put("/features", authMiddleware, providersController.setFeature);
router.delete("/keys/:provider", authMiddleware, providersController.removeKey);

export default router;
