import { Request, Response } from "express";
import { getProviderStatus, getModelCatalog, getNvidiaHealth } from "../services/providers.service";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import {
  listProviderKeys,
  getDefaultProvider,
  setDefaultProvider,
  saveProviderKey,
  deleteProviderKey,
  testProviderKey,
  isByokProvider,
  getFeatureProviders,
  setFeatureProvider,
  AI_FEATURES,
  BYOK_PROVIDERS,
} from "../services/provider-keys.service";
import { decryptSecret } from "../services/encryption.service";
import { prisma } from "../config/database";
import { logger } from "../config/logger";

export async function getStatus(req: Request, res: Response): Promise<void> {
  try {
    const providers = await getProviderStatus();
    res.json({ providers });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Provider status check failed" });
  }
}

export async function getModelCatalogHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const [catalog, providers] = await Promise.all([
      getModelCatalog(req.user?.userId),
      getProviderStatus(),
    ]);
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

// ---------------------------------------------------------------------------
// Bring-Your-Own-Key — every row is scoped to the authenticated user.
// ---------------------------------------------------------------------------

export async function getKeys(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const [keys, defaultProvider, featureProviders] = await Promise.all([
      listProviderKeys(userId),
      getDefaultProvider(userId),
      getFeatureProviders(userId),
    ]);
    res.json({ providers: BYOK_PROVIDERS, keys, defaultProvider, featureProviders, features: AI_FEATURES });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Could not load provider keys" });
  }
}

export async function addKey(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { provider, apiKey, label } = req.body;
    if (typeof provider !== "string" || !isByokProvider(provider)) {
      res.status(400).json({ error: "Unsupported provider" });
      return;
    }
    if (typeof apiKey !== "string" || !apiKey.trim()) {
      res.status(400).json({ error: "API key is required" });
      return;
    }
    const row = await saveProviderKey(userId, provider, apiKey, typeof label === "string" ? label : undefined);
    res.status(201).json({ key: row });
  } catch (error: any) {
    // Invalid-key rejections carry a user-facing message — keep the status 400.
    const status = /rejected|reach|Rate limited/.test(error?.message || "") ? 400 : 500;
    res.status(status).json({ error: error.message || "Could not save the key" });
  }
}

export async function testKey(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { provider, apiKey } = req.body;
    if (typeof provider !== "string" || !isByokProvider(provider)) {
      res.status(400).json({ error: "Unsupported provider" });
      return;
    }
    // Test the provided key, or fall back to the user's stored key.
    let key: string | undefined = typeof apiKey === "string" && apiKey.trim() ? apiKey.trim() : undefined;
    if (!key) {
      const keys = await listProviderKeys(req.user!.userId);
      if (keys.find((k) => k.provider === provider)?.hasUserKey) {
        const row = await prisma.providerKey.findUnique({
          where: { userId_provider: { userId: req.user!.userId, provider } },
        });
        if (row) key = decryptSecret(row.encryptedKey);
      }
    }
    if (!key) {
      res.status(400).json({ error: "No API key provided and none stored for this provider" });
      return;
    }
    const result = await testProviderKey(provider, key);
    res.json(result);
  } catch (error: any) {
    logger.error("Provider key test error:", error);
    res.status(500).json({ error: error.message || "Test failed" });
  }
}

export async function removeKey(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const provider = String(req.params.provider);
    if (!isByokProvider(provider)) {
      res.status(400).json({ error: "Unsupported provider" });
      return;
    }
    await deleteProviderKey(req.user!.userId, provider);
    res.json({ message: `Removed ${provider} key` });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Could not remove the key" });
  }
}

export async function setDefault(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { provider } = req.body;
    if (provider !== null && (typeof provider !== "string" || !isByokProvider(provider))) {
      res.status(400).json({ error: "Unsupported provider" });
      return;
    }
    await setDefaultProvider(req.user!.userId, provider ?? null);
    res.json({ defaultProvider: provider ?? null });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Could not set default provider" });
  }
}

export async function setFeature(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { feature, provider } = req.body;
    if (typeof feature !== "string" || !AI_FEATURES.some((f) => f.id === feature)) {
      res.status(400).json({ error: "Unsupported feature" });
      return;
    }
    if (provider !== null && (typeof provider !== "string" || !isByokProvider(provider))) {
      res.status(400).json({ error: "Unsupported provider" });
      return;
    }
    const featureProviders = await setFeatureProvider(req.user!.userId, feature, provider ?? null);
    res.json({ feature, provider: provider ?? null, featureProviders });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Could not set feature provider" });
  }
}
