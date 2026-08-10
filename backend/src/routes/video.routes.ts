import { Router } from "express";
import * as videoController from "../controllers/video.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.post("/generate", authMiddleware, videoController.generateValidators, videoController.generateVideo);
router.get("/models", authMiddleware, videoController.getModels);

export default router;
