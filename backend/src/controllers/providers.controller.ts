import { Request, Response } from "express";
import { getProviderStatus, getModelCatalog, getNvidiaHealth } from "../services/providers.service";

export async function getStatus(req: Request, res: Response): Promise<void> {
  try {
    const providers = await getProviderStatus();
    res.json({ providers });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Provider status check failed" });
  }
}

export async function getModelCatalogHandler(req: Request, res: Response): Promise<void> {
  try {
    const [catalog, providers] = await Promise.all([getModelCatalog(), getProviderStatus()]);
    res.json({ ...catalog, providers });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Model catalog failed" });
  }
}

export async function getNvidiaHealthHandler(req: Request, res: Response): Promise<void> {
  try {
    const health = await getNvidiaHealth();
    res.json(health);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "NVIDIA health check failed" });
  }
}
