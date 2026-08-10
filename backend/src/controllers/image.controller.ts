import { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import * as imageService from "../services/image.service";
import { logger } from "../config/logger";

export const generateValidators = [
  body("prompt").trim().isLength({ min: 1 }).withMessage("Prompt is required"),
  body("model").optional().isString(),
];

export async function generateImage(req: AuthenticatedRequest, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: "Validation failed", details: errors.array() });
    return;
  }

  try {
    const { prompt, model } = req.body;
    const imageUrl = await imageService.generateImage(prompt, model);
    res.json({ url: imageUrl, prompt });
  } catch (error: any) {
    logger.error("Image generation error:", error);
    res.status(500).json({ error: error.message || "Image generation failed" });
  }
}

export async function getModels(req: Request, res: Response): Promise<void> {
  try {
    const models = await imageService.getImageModels();
    res.json(models);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
