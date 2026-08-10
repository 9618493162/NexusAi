import { env } from "../config/env";
import { logger } from "../config/logger";
import { generateNvidiaImage, NVIDIA_IMAGE_MODELS } from "./nvidia-image.service";

const APIFRAME_BASE_URL = "https://api.apiframe.ai/v2";
const FAL_BASE_URL = "https://queue.fal.run";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const PIXAZO_BASE_URL = "https://gateway.pixazo.ai";

// Google Gemini image models — free tier via GEMINI_API_KEY (chat key).
const GEMINI_IMAGE_MODELS = [
  { id: "gemini-3-pro-image", name: "Gemini 3 Pro Image (Google)" },
  { id: "gemini-3.1-flash-image", name: "Gemini 3.1 Flash Image (Google)" },
  { id: "gemini-3.1-flash-lite-image", name: "Gemini 3.1 Flash Lite Image (Google)" },
];

function geminiKey(): string {
  return env.GEMINI_API_KEY || "";
}

async function generateViaGeminiImage(prompt: string, model: string): Promise<string> {
  const res = await fetch(`${GEMINI_BASE_URL}/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": geminiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let detail = body.slice(0, 200);
    try { const p = JSON.parse(body); if (p.error?.message) detail = p.error.message; } catch { /* non-JSON */ }
    if (/exceeded your current quota/i.test(detail)) {
      throw new Error("Google Gemini image quota is exhausted — wait for the rate limit to reset (ai.dev/rate-limit)");
    }
    throw new Error(`Gemini image error ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as any;
  const part = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
  if (part?.inlineData?.data) {
    const mime = part.inlineData.mimeType || "image/png";
    return `data:${mime};base64,${part.inlineData.data}`;
  }
  throw new Error("Gemini returned no image data");
}

const APIFRAME_IMAGE_MODELS = [
  { id: "flux-2-pro", name: "FLUX 2 Pro" },
  { id: "flux-1.1-pro", name: "FLUX 1.1 Pro" },
  { id: "seedream-5.0-pro", name: "Seedream 5.0 Pro" },
  { id: "nano-banana-2", name: "Nano Banana 2" },
  { id: "gpt-image-2", name: "GPT Image 2" },
  { id: "imagen-4", name: "Imagen 4" },
  { id: "ideogram-v4-balanced", name: "Ideogram V4" },
  { id: "kling-image", name: "Kling Image" },
  { id: "midjourney", name: "Midjourney" },
];

async function apiError(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(body);
    if (parsed.error) return `apiframe.ai error ${response.status}: ${parsed.error}`;
  } catch { /* non-JSON body */ }
  return `apiframe.ai error ${response.status}: ${body.slice(0, 200)}`;
}

async function pollApiframeJob(jobId: string, timeoutMs: number = 120_000): Promise<any> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await fetch(`${APIFRAME_BASE_URL}/jobs/${jobId}`, {
      headers: { "X-API-Key": env.APIFRAME_API_KEY! },
    });
    if (!res.ok) throw new Error(await apiError(res));
    const job = (await res.json()) as { status?: string; result?: any; error?: string };
    if (job.status === "COMPLETED") return job.result;
    if (job.status === "FAILED") {
      throw new Error(`apiframe.ai job failed: ${job.error || "unknown error"}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("apiframe.ai generation timed out");
}

// Only send a model-specific params object when the model accepts it —
// apiframe rejects unknown param objects with a 400 for other models.
function apiframeImageParams(model: string): Record<string, unknown> | undefined {
  if (model.startsWith("flux") || model.startsWith("seedream")) {
    return { fluxParams: { aspect_ratio: "4:3", output_format: "png" } };
  }
  return undefined;
}

async function generateViaApiframe(prompt: string, model: string): Promise<string> {
  const res = await fetch(`${APIFRAME_BASE_URL}/images/generate`, {
    method: "POST",
    headers: {
      "X-API-Key": env.APIFRAME_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      model,
      ...(apiframeImageParams(model) || {}),
    }),
  });
  if (!res.ok) throw new Error(await apiError(res));
  const { jobId } = (await res.json()) as { jobId: string };
  const result = await pollApiframeJob(jobId);
  return result?.images?.[0] || "";
}

// Pixazo.ai — free FLUX Schnell tier (Ocp-Apim-Subscription-Key auth). The
// free model responds synchronously with {"output": "<image url>"}.
const PIXAZO_IMAGE_MODELS = [
  { id: "pixazo/flux-1-schnell", name: "FLUX 1.0 Schnell (Pixazo — free)" },
];

async function generateViaPixazo(prompt: string, model: string): Promise<string> {
  // Map the app-level id to the provider's per-model endpoint. Only the free
  // FLUX Schnell model is exposed (paid models need wallet balance).
  const endpoint =
    model === "pixazo/flux-1-schnell" ? `${PIXAZO_BASE_URL}/flux-1-schnell/v1/getData` : "";
  if (!endpoint) throw new Error(`Unknown Pixazo model: ${model}`);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": env.PIXAZO_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt, aspect_ratio: "1:1" }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let detail = body.slice(0, 200);
    try { const p = JSON.parse(body); if (p.message) detail = p.message; else if (p.error) detail = p.error; } catch { /* non-JSON */ }
    if (/insufficient balance/i.test(detail)) {
      throw new Error(`pixazo.ai has no balance — the free FLUX Schnell model should work; top up at pixazo.ai if it doesn't`);
    }
    throw new Error(`pixazo.ai error ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as { output?: string };
  if (!data.output) throw new Error("pixazo.ai returned no image URL");
  return data.output;
}

async function generateViaFal(prompt: string, model?: string): Promise<string> {
  const modelId = model || "fal-ai/flux/schnell";
  const response = await fetch(`${FAL_BASE_URL}/${modelId}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${env.FAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_size: "landscape_4_3",
      num_inference_steps: 4,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    let detail = body.slice(0, 200);
    try { const p = JSON.parse(body); if (p.detail) detail = p.detail; } catch { /* non-JSON */ }
    throw new Error(`fal.ai error ${response.status}: ${detail}`);
  }
  const data = (await response.json()) as { images?: Array<{ url?: string }> };
  return data.images?.[0]?.url || "";
}

export async function generateImage(prompt: string, model?: string): Promise<string> {
  try {
    const failures: string[] = [];
    const tryProvider = async (label: string, fn: () => Promise<string>): Promise<string | null> => {
      try {
        return await fn();
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        failures.push(`${label}: ${msg}`);
        logger.warn(`${label} image generation failed:`, msg);
        return null;
      }
    };

    // Explicit NVIDIA NIM model (ids like "nvidia/flux-2-klein").
    if (model?.startsWith("nvidia/") && (env.NVIDIA_IMAGE_API_KEY || env.NVIDIA_NIM_API_KEY)) {
      const r = await tryProvider("nvidia", () => generateNvidiaImage(prompt, model!));
      if (r) return r;
    }
    // Explicit Google Gemini image model (ids like "gemini-3-pro-image").
    if (model?.startsWith("gemini") && geminiKey()) {
      const r = await tryProvider("gemini", () => generateViaGeminiImage(prompt, model!));
      if (r) return r;
    }
    // Explicit Pixazo model (ids like "pixazo/flux-1-schnell").
    if (model?.startsWith("pixazo/") && env.PIXAZO_API_KEY) {
      const r = await tryProvider("pixazo", () => generateViaPixazo(prompt, model!));
      if (r) return r;
    }
    // Default chain: apiframe → fal → nvidia → gemini → pixazo.
    const isFalModel = !!model && model.startsWith("fal-ai/");
    if (env.APIFRAME_API_KEY && !isFalModel) {
      const r = await tryProvider("apiframe", () => generateViaApiframe(prompt, model || "flux-2-pro"));
      if (r) return r;
    }
    if (env.FAL_API_KEY) {
      const r = await tryProvider("fal", () => generateViaFal(prompt, isFalModel ? model : undefined));
      if (r) return r;
    }
    if (env.NVIDIA_IMAGE_API_KEY || env.NVIDIA_NIM_API_KEY) {
      const r = await tryProvider("nvidia", () => generateNvidiaImage(prompt, "nvidia/flux-2-klein"));
      if (r) return r;
    }
    if (geminiKey()) {
      const r = await tryProvider("gemini", () => generateViaGeminiImage(prompt, "gemini-3.1-flash-image"));
      if (r) return r;
    }
    if (env.PIXAZO_API_KEY) {
      const r = await tryProvider("pixazo", () => generateViaPixazo(prompt, "pixazo/flux-1-schnell"));
      if (r) return r;
    }
    if (failures.length) throw new Error(failures.join(" | "));
    throw new Error("No image provider configured (NVIDIA_IMAGE_API_KEY, APIFRAME_API_KEY, FAL_API_KEY, GEMINI_API_KEY or PIXAZO_API_KEY)");
  } catch (error) {
    logger.error("Image generation error:", error);
    throw error;
  }
}

export async function getImageModels(): Promise<Array<{ id: string; name: string }>> {
  const models: Array<{ id: string; name: string }> = [];
  if (env.NVIDIA_IMAGE_API_KEY || env.NVIDIA_NIM_API_KEY) models.push(...NVIDIA_IMAGE_MODELS);
  if (geminiKey()) models.push(...GEMINI_IMAGE_MODELS);
  if (env.APIFRAME_API_KEY) models.push(...APIFRAME_IMAGE_MODELS);
  if (env.PIXAZO_API_KEY) models.push(...PIXAZO_IMAGE_MODELS);
  if (models.length) return models;
  return [
    { id: "fal-ai/flux/schnell", name: "FLUX Schnell (Fast)" },
    { id: "fal-ai/flux/dev", name: "FLUX Dev (High Quality)" },
    { id: "fal-ai/stable-diffusion-xl", name: "Stable Diffusion XL" },
    { id: "fal-ai/flux-pro", name: "FLUX Pro (Best Quality)" },
  ];
}
