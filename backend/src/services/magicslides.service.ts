import { env } from "../config/env";
import { logger } from "../config/logger";

/**
 * MagicSlides.app presentation generation — the free/credit API the provided
 * key unlocks. Sends a topic or text and receives REAL PPTX + PDF download
 * URLs (verified live). The key stays server-side in the backend .env.
 */

const API_URL = "https://api.magicslides.app/public/api/ppt-from-text";

export interface MagicSlidesResult {
  url: string;
  pdfUrl: string;
  pptId: string;
}

export function magicSlidesConfigured(): boolean {
  return !!env.MAGICSLIDES_API_KEY;
}

/**
 * Generate a real presentation. `topic` is the deck subject; `text` (optional)
 * is richer content that takes precedence when provided.
 */
export async function generateMagicSlides(
  topic: string,
  text?: string,
  slideCount = 8
): Promise<MagicSlidesResult> {
  const key = env.MAGICSLIDES_API_KEY;
  if (!key) throw new Error("MagicSlides is not configured (MAGICSLIDES_API_KEY missing)");

  const payload: Record<string, unknown> = {
    apiKey: key,
    topic: topic.slice(0, 200),
    slideCount,
    language: "en",
    aiImages: true,
  };
  // When we have real document content, send it as the source text instead of
  // a bare topic — the deck is then built from the actual document.
  if (text && text.trim().length > 40) {
    payload.text = text.slice(0, 12000);
  }

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(150000),
    });
  } catch (error) {
    logger.error("MagicSlides request error:", error);
    throw new Error("MagicSlides generation failed (network error). Try again in a moment.");
  }

  const body = (await res.json().catch(() => null)) as
    | {
        status?: string;
        url?: string;
        pdfUrl?: string;
        pptId?: string;
        message?: string;
        error?: { field?: string; message?: string } | string | null;
      }
    | null;

  if (!res.ok || body?.status !== "success" || !body?.url) {
    const raw = body?.message || `MagicSlides error (HTTP ${res.status})`;
    const nested = (body?.error as { message?: string } | undefined)?.message;
    logger.warn("MagicSlides generation failed:", raw, nested || "");
    // Out of credits comes back either as HTTP 402 or as a 200 with a
    // credits message in the body — both surfaced honestly, no fake retry.
    const outOfCredits =
      res.status === 402 || /credit|upgrade/i.test(`${raw} ${nested || ""}`);
    throw new Error(
      outOfCredits
        ? "MagicSlides is out of credits on this account. Add credits at magicslides.app."
        : raw
    );
  }

  return {
    url: body.url,
    pdfUrl: body.pdfUrl || "",
    pptId: body.pptId || "",
  };
}
