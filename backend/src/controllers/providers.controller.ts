import { Request, Response } from "express";
import { getProviderStatus } from "../services/providers.service";

export async function getStatus(req: Request, res: Response): Promise<void> {
  try {
    const providers = await getProviderStatus();
    res.json({ providers });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Provider status check failed" });
  }
}
