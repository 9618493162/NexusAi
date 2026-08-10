import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import * as usageService from "../services/usage.service";

export async function getUsage(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const usage = await usageService.getUserUsage(userId);
    res.json(usage);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
