import { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import * as voiceService from "../services/voice.service";
import { logger } from "../config/logger";

// Raw audio bytes arrive in req.body (parsed by express.raw on the route).
export async function transcribeAudio(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const audio = req.body as Buffer | undefined;
    if (!audio || !Buffer.isBuffer(audio) || audio.length === 0) {
      res.status(400).json({ error: "Audio body is required" });
      return;
    }
    const contentType = (req.headers["content-type"] as string) || "audio/webm";
    const language = String(req.query.language || "");
    const transcript = await voiceService.transcribeAudio(audio, contentType, language);
    res.json({ transcript });
  } catch (error: any) {
    logger.error("Voice transcription error:", error);
    res.status(500).json({ error: error.message || "Transcription failed" });
  }
}

export const speakValidators = [
  body("text").trim().isLength({ min: 1, max: 1000 }).withMessage("Text is required (max 1000 chars)"),
  body("voice").optional().isString(),
  body("language").optional().isString().isLength({ min: 2, max: 20 }),
];

export async function speak(req: AuthenticatedRequest, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: "Validation failed", details: errors.array() });
    return;
  }
  try {
    const { text, voice, language } = req.body;
    // Non-English replies use free Edge neural voices (Deepgram aura-2 on
    // this account is English-only). The requested `voice` is honored when
    // it's valid for the language (the per-language male/female picker). If
    // the language has no server-side voice (e.g. Punjabi), tell the client
    // to fall back to browser speech.
    if (language && language !== "en") {
      const voiceId = voiceService.resolveEdgeVoice(language, voice);
      if (!voiceId) {
        res.status(501).json({ error: "No server-side voice for this language" });
        return;
      }
      const result = await voiceService.synthesizeSpeechMultilingual(text, voiceId);
      if (!result) {
        res.status(501).json({ error: "Voice synthesis failed" });
        return;
      }
      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Content-Length", result.audio.length);
      res.send(result.audio);
      return;
    }
    const { audio, contentType } = await voiceService.synthesizeSpeech(text, voice);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", audio.length);
    res.send(audio);
  } catch (error: any) {
    logger.error("Voice synthesis error:", error);
    res.status(500).json({ error: error.message || "Speech synthesis failed" });
  }
}

export async function getVoices(req: AuthenticatedRequest, res: Response): Promise<void> {
  res.json(voiceService.getVoices());
}

export async function getLanguages(req: AuthenticatedRequest, res: Response): Promise<void> {
  res.json(voiceService.getLanguages());
}

export async function getEdgeVoices(req: AuthenticatedRequest, res: Response): Promise<void> {
  res.json(voiceService.getEdgeVoices());
}
