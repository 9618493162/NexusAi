import { Router } from "express";
import * as imageController from "../controllers/image.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.post("/generate", authMiddleware, imageController.generateValidators, imageController.generateImage);
router.get("/models", authMiddleware, imageController.getModels);

export default router;
