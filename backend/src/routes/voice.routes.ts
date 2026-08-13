import { Router } from "express";
import express from "express";
import * as voiceController from "../controllers/voice.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

// Audio bytes arrive as the raw request body (webm/ogg/wav/mp3...).
router.post(
  "/transcribe",
  authMiddleware,
  express.raw({ type: ["audio/*", "application/octet-stream"], limit: "25mb" }),
  voiceController.transcribeAudio
);
router.post("/speak", authMiddleware, voiceController.speakValidators, voiceController.speak);
router.get("/voices", authMiddleware, voiceController.getVoices);
router.get("/edge-voices", authMiddleware, voiceController.getEdgeVoices);
router.get("/languages", authMiddleware, voiceController.getLanguages);

// Persisted voice-studio sessions (real history across devices).
router.post("/sessions", authMiddleware, voiceController.createSession);
router.get("/sessions", authMiddleware, voiceController.getSessions);
router.patch("/sessions/:id", authMiddleware, voiceController.updateSession);
router.delete("/sessions/:id", authMiddleware, voiceController.deleteSession);

export default router;
