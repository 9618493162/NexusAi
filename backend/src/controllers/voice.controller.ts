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
    const result = await voiceService.transcribeAudio(audio, contentType, language);
    res.json(result);
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

export async function createSession(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { transcript, translation, analysis, sourceLang, targetLang } = req.body || {};
    if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
      res.status(400).json({ error: "Transcript is required" });
      return;
    }
    const session = await voiceService.createVoiceSession(req.user!.userId, {
      transcript,
      translation,
      analysis,
      sourceLang,
      targetLang,
    });
    res.status(201).json(session);
  } catch (error: any) {
    logger.error("Voice session create error:", error);
    res.status(500).json({ error: error.message || "Could not save voice session" });
  }
}

export async function getSessions(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const sessions = await voiceService.listVoiceSessions(req.user!.userId);
    res.json({ sessions });
  } catch (error: any) {
    logger.error("Voice sessions list error:", error);
    res.status(500).json({ error: error.message || "Could not load voice history" });
  }
}

export async function updateSession(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { translation, analysis, sourceLang, targetLang } = req.body || {};
    const result = await voiceService.updateVoiceSession(req.user!.userId, String(req.params.id), {
      ...(translation !== undefined ? { translation } : {}),
      ...(analysis !== undefined ? { analysis } : {}),
      ...(sourceLang !== undefined ? { sourceLang } : {}),
      ...(targetLang !== undefined ? { targetLang } : {}),
    });
    if (result.count === 0) {
      res.status(404).json({ error: "Voice session not found" });
      return;
    }
    res.json({ ok: true });
  } catch (error: any) {
    logger.error("Voice session update error:", error);
    res.status(500).json({ error: error.message || "Could not update voice session" });
  }
}

export async function deleteSession(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await voiceService.deleteVoiceSession(req.user!.userId, String(req.params.id));
    if (result.count === 0) {
      res.status(404).json({ error: "Voice session not found" });
      return;
    }
    res.json({ ok: true });
  } catch (error: any) {
    logger.error("Voice session delete error:", error);
    res.status(500).json({ error: error.message || "Could not delete voice session" });
  }
}
