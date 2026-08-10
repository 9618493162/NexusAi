import { Router } from "express";
import * as settingsController from "../controllers/settings.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

// Per-user spoken-reply language colors, synced across devices.
router.get("/language-colors", authMiddleware, settingsController.getLanguageColors);
router.put("/language-colors", authMiddleware, settingsController.putLanguageColors);

export default router;
