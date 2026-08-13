import { env } from "../config/env";
import { logger } from "../config/logger";

const APIFRAME_BASE_URL = "https://api.apiframe.ai/v2";
const FAL_BASE_URL = "https://queue.fal.run";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const JSON2VIDEO_BASE_URL = "https://api.json2video.com/v2";
const VADOO_BASE_URL = "https://aiapi.vadoo.tv";

// Veo 3.1 via the Gemini Developer API (predictLongRunning).
const VEO_MODEL = "veo-3.1-generate-preview";

const VEO_VIDEO_MODELS = [
  { id: "veo-3.1", name: "Veo 3.1 (Google)" },
];

function geminiKey(): string {
  return env.GEMINI_MEDIA_API_KEY || env.GEMINI_API_KEY || "";
}

// Submit a Veo generation and poll the long-running operation to completion.
async function generateViaVeo(prompt: string, durationSeconds: number = 6): Promise<string> {
  const submitRes = await fetch(
    `${GEMINI_BASE_URL}/models/${VEO_MODEL}:predictLongRunning`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": geminiKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          aspectRatio: "16:9",
          durationSeconds,
        },
      }),
    }
  );
  if (!submitRes.ok) {
    const body = await submitRes.text().catch(() => "");
    let detail = body.slice(0, 200);
    try { const p = JSON.parse(body); if (p.error?.message) detail = p.error.message; } catch { /* non-JSON */ }
    if (/exceeded your current quota|RESOURCE_EXHAUSTED/i.test(detail)) {
      throw new Error("Google Veo quota is exhausted — wait a bit or check ai.google.dev/rate-limit, then try again");
    }
    throw new Error(`Veo error ${submitRes.status}: ${detail}`);
  }
  const op = (await submitRes.json()) as { name?: string };
  if (!op.name) throw new Error("Veo did not return an operation id");

  const started = Date.now();
  const timeoutMs = 300_000;
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 5000));
    const pollRes = await fetch(`${GEMINI_BASE_URL}/${op.name}`, {
      headers: { "x-goog-api-key": geminiKey() },
    });
    if (!pollRes.ok) {
      const body = await pollRes.text().catch(() => "");
      throw new Error(`Veo poll error ${pollRes.status}: ${body.slice(0, 200)}`);
    }
    const state = (await pollRes.json()) as any;
    if (state.done) {
      const video = state.response?.generatedVideos?.[0]?.video;
      // Prefer inline base64 data — a plain data: URL plays directly in the
      // frontend <video> tag. The Gemini Files API uri requires auth headers
      // the browser won't send, so it's the fallback (also cover the older
      // singular response shape).
      const data = video?.data || state.response?.video?.data;
      if (data) return `data:video/mp4;base64,${data}`;
      const uri = video?.uri || state.response?.generatedVideo?.uri;
      if (uri) return uri;
      const err = state.error?.message || state.response?.error?.message;
      throw new Error(`Veo generation failed: ${err || "no video in response"}`);
    }
  }
  throw new Error("Veo generation timed out");
}

const APIFRAME_VIDEO_MODELS = [
  { id: "kling-2.6", name: "Kling 2.6" },
  { id: "veo-3.1", name: "Veo 3.1" },
  { id: "sora-2", name: "Sora 2" },
  { id: "seedance-2", name: "Seedance 2.0" },
  { id: "runway-gen4.5", name: "Runway Gen-4.5" },
  { id: "hailuo-03", name: "Hailuo 03" },
  { id: "luma-ray-2", name: "Luma Ray 2" },
  { id: "wan-2.6", name: "Wan 2.6" },
  { id: "midjourney-video", name: "Midjourney Video" },
];

async function apiError(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(body);
    if (parsed.error) {
      // Surface credit/balance problems as a clear, actionable message.
      if (/insufficient credits/i.test(String(parsed.error))) {
        return `apiframe.ai has no credits left — top up at apiframe.ai/dashboard/billing to generate videos`;
      }
      return `apiframe.ai error ${response.status}: ${parsed.error}`;
    }
  } catch { /* non-JSON body */ }
  return `apiframe.ai error ${response.status}: ${body.slice(0, 200)}`;
}

async function pollApiframeJob(jobId: string, timeoutMs: number = 600_000): Promise<any> {
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
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("apiframe.ai generation timed out");
}

// Only send a model-specific params object when the model accepts it —
// apiframe rejects unknown param objects with a 400 for other models.
function apiframeVideoParams(model: string): Record<string, unknown> | undefined {
  if (model.startsWith("kling")) {
    return { klingParams: { duration: 5, aspect_ratio: "16:9" } };
  }
  if (model.startsWith("veo")) {
    return { veoParams: { durationSeconds: 5, aspect_ratio: "16:9" } };
  }
  return undefined;
}

async function generateViaApiframe(prompt: string, model: string): Promise<string> {
  const res = await fetch(`${APIFRAME_BASE_URL}/videos/generate`, {
    method: "POST",
    headers: {
      "X-API-Key": env.APIFRAME_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      model,
      ...(apiframeVideoParams(model) || {}),
    }),
  });
  if (!res.ok) throw new Error(await apiError(res));
  const { jobId } = (await res.json()) as { jobId: string };
  const result = await pollApiframeJob(jobId);
  return result?.videoUrl || "";
}

async function generateViaFal(prompt: string, model?: string): Promise<string> {
  const response = await fetch(`${FAL_BASE_URL}/fal-ai/luma-dream-machine`, {
    method: "POST",
    headers: {
      Authorization: `Key ${env.FAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      duration: "5s",
      aspect_ratio: "16:9",
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    let detail = body.slice(0, 200);
    try { const p = JSON.parse(body); if (p.detail) detail = p.detail; } catch { /* non-JSON */ }
    throw new Error(`fal.ai error ${response.status}: ${detail}`);
  }
  const data = (await response.json()) as { video?: { url?: string } };
  return data.video?.url || "";
}

// Vadoo AI generates a full AI story video (AI footage + voiceover + captions)
// from a prompt. It takes a few minutes to render and returns a public CDN URL.
async function generateViaVadoo(prompt: string): Promise<string> {
  const res = await fetch(`${VADOO_BASE_URL}/api/generate_video`, {
    method: "POST",
    headers: {
      "X-Api-Key": env.VADOO_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topic: "Custom",
      prompt: prompt.slice(0, 900),
      duration: "30-60",
      aspect_ratio: "16:9",
      language: "English",
      style: "cinematic",
      use_ai: 1,
      include_voiceover: 1,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let detail = body.slice(0, 200);
    try { const p = JSON.parse(body); if (p.detail) detail = p.detail; else if (p.error) detail = p.error; } catch { /* non-JSON */ }
    if (/generation limits over|upgrade for more/i.test(detail)) {
      throw new Error("Vadoo AI generation limit reached — upgrade your plan or wait for the limit to reset");
    }
    throw new Error(`Vadoo AI error ${res.status}: ${detail}`);
  }
  const { vid } = (await res.json()) as { vid?: string };
  if (!vid) throw new Error("Vadoo AI did not return a video id");

  const started = Date.now();
  const timeoutMs = 480_000; // AI story videos can take a few minutes
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 15000));
    const pollRes = await fetch(`${VADOO_BASE_URL}/api/get_video_url?id=${vid}`, {
      headers: { "X-Api-Key": env.VADOO_API_KEY! },
    });
    if (!pollRes.ok) {
      const body = await pollRes.text().catch(() => "");
      throw new Error(`Vadoo AI poll error ${pollRes.status}: ${body.slice(0, 200)}`);
    }
    const state = (await pollRes.json()) as { status?: string; url?: string; error?: string };
    if (state.status === "completed" && state.url) return state.url;
    if (state.status === "failed") throw new Error(`Vadoo AI generation failed: ${state.error || "unknown error"}`);
  }
  throw new Error("Vadoo AI generation timed out");
}

// JSON2Video renders a movie from a JSON document (scenes + elements) instead
// of an AI text-to-video model: the prompt becomes an animated text scene on a
// branded background. It doesn't burn per-generation AI credits, so it keeps
// video generation working when the AI providers are out of quota.
async function generateViaJson2Video(prompt: string): Promise<string> {
  const movie = {
    resolution: "full-hd",
    quality: "high",
    scenes: [
      {
        "background-color": "#1a1a2e",
        elements: [
          {
            type: "text",
            style: "003",
            text: prompt.slice(0, 220) || "Your video is ready",
            settings: {
              color: "#FFFFFF",
              "font-size": "72px",
              "font-family": "Montserrat",
              "font-weight": "700",
              shadow: 3,
            },
            width: 1600,
            duration: 8,
          },
        ],
      },
    ],
  };

  const res = await fetch(`${JSON2VIDEO_BASE_URL}/movies`, {
    method: "POST",
    headers: {
      "x-api-key": env.JSON2VIDEO_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(movie),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let detail = body.slice(0, 200);
    try { const p = JSON.parse(body); if (p.error) detail = p.error; } catch { /* non-JSON */ }
    if (/quota of movies in your plan/i.test(detail)) {
      throw new Error("json2video plan quota exhausted — upgrade or wait for the next billing cycle");
    }
    throw new Error(`json2video error ${res.status}: ${detail}`);
  }
  const { project } = (await res.json()) as { project?: string };
  if (!project) throw new Error("json2video did not return a project id");

  const started = Date.now();
  const timeoutMs = 600_000;
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 5000));
    const pollRes = await fetch(`${JSON2VIDEO_BASE_URL}/movies?project=${project}`, {
      headers: { "x-api-key": env.JSON2VIDEO_API_KEY! },
    });
    if (!pollRes.ok) {
      const body = await pollRes.text().catch(() => "");
      throw new Error(`json2video poll error ${pollRes.status}: ${body.slice(0, 200)}`);
    }
    const data = (await pollRes.json()) as { movie?: { status?: string; url?: string; error?: string; message?: string } };
    const movieState = data.movie;
    if (!movieState) throw new Error("json2video returned no movie state");
    if (movieState.status === "done" && movieState.url) return movieState.url;
    if (movieState.status === "error" || movieState.status === "timeout") {
      throw new Error(`json2video render failed: ${movieState.error || movieState.message || movieState.status}`);
    }
  }
  throw new Error("json2video render timed out");
}

export async function generateVideo(prompt: string, model?: string): Promise<string> {
  try {
    const failures: string[] = [];
    const tryProvider = async (label: string, fn: () => Promise<string>): Promise<string | null> => {
      try {
        return await fn();
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        failures.push(`${label}: ${msg}`);
        logger.warn(`${label} video generation failed:`, msg);
        return null;
      }
    };

    // json2video is the only model currently exposed (all AI providers were
    // out of credits as of 2026-08-10) — go straight to it instead of wasting
    // requests on locked providers.
    if (model === "json2video") {
      const j = await tryProvider("json2video", () => generateViaJson2Video(prompt));
      if (j) return j;
      if (failures.length) throw new Error(failures.join(" | "));
      throw new Error("json2video generation failed");
    }
    // Primary: Veo 3.1 via Gemini (model id "veo-3.1") when a Gemini key exists.
    const isVeoModel = !model || model === "veo-3.1";
    if (geminiKey() && isVeoModel) {
      const v = await tryProvider("Veo", () => generateViaVeo(prompt));
      if (v) return v;
    }
    // Then: apiframe.ai (model ids like "kling-2.6"), then fal.ai.
    const isApiframeModel = !model || APIFRAME_VIDEO_MODELS.some((m) => m.id === model) || model === "veo-3.1";
    if (env.APIFRAME_API_KEY && isApiframeModel) {
      const a = await tryProvider("apiframe", () => generateViaApiframe(prompt, model || "kling-2.6"));
      if (a) return a;
    }
    if (env.FAL_API_KEY) {
      const f = await tryProvider("fal", () => generateViaFal(prompt, model));
      if (f) return f;
    }
    // Vadoo AI generates real AI footage + voiceover (last AI provider).
    if (env.VADOO_API_KEY) {
      const v = await tryProvider("vadoo", () => generateViaVadoo(prompt));
      if (v) return v;
    }
    // Last resort: JSON2Video renders an animated text video from the prompt.
    // It has no per-generation AI cost, so video generation keeps working even
    // when every AI provider is out of credits/quota.
    if (env.JSON2VIDEO_API_KEY) {
      const j = await tryProvider("json2video", () => generateViaJson2Video(prompt));
      if (j) return j;
    }
    if (failures.length) throw new Error(failures.join(" | "));
    throw new Error("No video provider configured (GEMINI_MEDIA_API_KEY, APIFRAME_API_KEY, FAL_API_KEY or JSON2VIDEO_API_KEY)");
  } catch (error) {
    logger.error("Video generation error:", error);
    throw error;
  }
}

export async function getVideoModels(): Promise<Array<{ id: string; name: string }>> {
  const models: Array<{ id: string; name: string }> = [];
  // Only list models whose provider currently works. Verified 2026-08-10:
  // - apiframe (Kling/Sora/Seedance/Runway/Hailuo/Luma/Wan/Midjourney): 402 Insufficient credits
  // - Veo 3.1 (Google): 429 quota exhausted
  // - Vadoo: 400 generation limit reached
  // All fall back to json2video, which is confirmed working. Re-add a provider
  // here (or in VEO_VIDEO_MODELS / APIFRAME_VIDEO_MODELS) once it has credits.
  if (env.JSON2VIDEO_API_KEY) {
    models.push({ id: "json2video", name: "JSON2Video (text render)" });
  }
  if (models.length) return models;
  return [
    { id: "fal-ai/luma-dream-machine", name: "Luma Dream Machine" },
    { id: "fal-ai/kling", name: "Kling Video" },
  ];
}
