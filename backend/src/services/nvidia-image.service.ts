import { env } from "../config/env";
import { logger } from "../config/logger";

export const NVCF_BASE_URL = "https://api.nvcf.nvidia.com/v2/nvcf";

// Verified ACTIVE function IDs on this account (from /v2/nvcf/functions).
export const NVIDIA_IMAGE_FUNCTIONS: Record<string, { id: string; name: string }> = {
  "nvidia/flux-2-klein": {
    id: "f67e96d8-1c4e-422e-a913-90f00e19aa9a",
    name: "FLUX 2 Klein (NVIDIA)",
  },
  "nvidia/flux-1-dev": {
    id: "0c474133-6fd2-42f6-be29-8ebbbaeaaeb2",
    name: "FLUX 1 Dev (NVIDIA)",
  },
  // flux-1-schnell and cosmos3-super were removed: the function IDs exist on
  // the account but hang at execution (60s/150s timeouts on direct probes),
  // while flux-2-klein and flux-1-dev return instantly.
};

export const NVIDIA_IMAGE_MODELS = Object.entries(NVIDIA_IMAGE_FUNCTIONS).map(([id, v]) => ({
  id,
  name: v.name,
}));

function apiKey(): string {
  return env.NVIDIA_IMAGE_API_KEY || env.NVIDIA_NIM_API_KEY || "";
}

async function nvidiaError(res: Response): Promise<Error> {
  const body = await res.text().catch(() => "");
  let detail = body.slice(0, 200);
  try {
    const parsed = JSON.parse(body);
    if (parsed.detail) detail = parsed.detail;
    if (parsed.message) detail = parsed.message;
  } catch { /* non-JSON */ }
  return new Error(`NVIDIA NIM error ${res.status}: ${detail}`);
}

// Submit a job; returns the request id when async (202) or a data URL when synchronous (200).
async function submitJob(functionId: string, body: Record<string, unknown>): Promise<{ reqId?: string; dataUrl?: string }> {
  const res = await fetch(`${NVCF_BASE_URL}/pexec/functions/${functionId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 200) {
    const data = (await res.json()) as { artifacts?: Array<{ base64?: string; url?: string; type?: string }> };
    const artifact = data.artifacts?.[0];
    if (artifact?.base64) {
      const mime = artifact.type === "video/mp4" ? "video/mp4" : "image/jpeg";
      return { dataUrl: `data:${mime};base64,${artifact.base64}` };
    }
    if (artifact?.url) return { dataUrl: artifact.url };
    // NVIDIA can return 200 with an empty artifacts array on rate-limit or cold
    // start races — retry once before giving up.
    throw new Error("NVIDIA NIM returned no artifact, retrying");
  }

  if (res.status === 202) {
    const reqId = res.headers.get("nvcf-reqid");
    if (!reqId) throw new Error("NVIDIA NIM returned 202 without a request id");
    return { reqId };
  }

  throw await nvidiaError(res);
}

// Poll an async job until it completes, returning the artifact as a data URL.
async function pollJob(reqId: string, timeoutMs: number): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 4000));
    const res = await fetch(`${NVCF_BASE_URL}/pexec/status/${reqId}`, {
      headers: { Authorization: `Bearer ${apiKey()}` },
    });
    if (res.status === 200) {
      const data = (await res.json()) as { artifacts?: Array<{ base64?: string; url?: string; type?: string }> };
      const artifact = data.artifacts?.[0];
      if (artifact?.base64) {
        const mime = artifact.type === "video/mp4" ? "video/mp4" : "image/jpeg";
        return `data:${mime};base64,${artifact.base64}`;
      }
      if (artifact?.url) return artifact.url;
    }
    // 404 means the request id is no longer tracked; keep polling a bit in case of transient misses.
  }
  throw new Error("NVIDIA NIM generation timed out");
}

export async function generateNvidiaImage(prompt: string, modelId: string): Promise<string> {
  const entry = NVIDIA_IMAGE_FUNCTIONS[modelId];
  if (!entry) throw new Error(`Unknown NVIDIA image model: ${modelId}`);

  const body: Record<string, unknown> = { prompt, seed: Math.floor(Math.random() * 100000) };

  try {
    // Retry once — NVIDIA occasionally returns 200 with an empty artifact on
    // cold starts or when a worker is recycled mid-request.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { reqId, dataUrl } = await submitJob(entry.id, body);
        if (dataUrl !== undefined && dataUrl) return dataUrl;
        if (reqId) return await pollJob(reqId, 180_000);
      } catch (submitError) {
        if (attempt === 2) throw submitError;
        logger.warn(`NVIDIA image attempt ${attempt} failed, retrying:`, submitError instanceof Error ? submitError.message : submitError);
      }
    }
    throw new Error("NVIDIA NIM returned no result");
  } catch (error) {
    logger.error(`NVIDIA image generation error (${modelId}):`, error);
    throw error;
  }
}
