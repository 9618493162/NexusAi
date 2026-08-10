import { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import * as videoService from "../services/video.service";
import { logger } from "../config/logger";

export const generateValidators = [
  body("prompt").trim().isLength({ min: 1 }).withMessage("Prompt is required"),
  body("model").optional().isString(),
];

export async function generateVideo(req: AuthenticatedRequest, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: "Validation failed", details: errors.array() });
    return;
  }

  try {
    const { prompt, model } = req.body;
    const videoUrl = await videoService.generateVideo(prompt, model);
    res.json({ url: videoUrl, prompt });
  } catch (error: any) {
    logger.error("Video generation error:", error);
    res.status(500).json({ error: error.message || "Video generation failed" });
  }
}

export async function getModels(req: Request, res: Response): Promise<void> {
  try {
    const models = await videoService.getVideoModels();
    res.json(models);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
