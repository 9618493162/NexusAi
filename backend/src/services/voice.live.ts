import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { env } from "../config/env";
import { verifyAccessToken, isJwtError } from "../utils/jwt";
import { logger } from "../config/logger";
import { isValidLanguage } from "./voice.service";

const DEEPGRAM_LIVE_URL = "wss://api.deepgram.com/v1/listen";

// Browser -> backend -> Deepgram live transcription proxy. The Deepgram API
// key stays server-side; the browser authenticates with its own app JWT and
// streams raw mic audio up, receiving live transcript results back.
export function attachVoiceLiveProxy(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/api/voice/live" });

  wss.on("connection", (client, req) => {
    logger.info(`Voice live: browser connected from ${req.socket.remoteAddress}`);
    // Authenticate the browser via its app access token (?token=...).
    let token = "";
    try {
      token = new URL(req.url || "/", "http://localhost").searchParams.get("token") || "";
    } catch { /* fall through to reject */ }
    try {
      verifyAccessToken(token);
    } catch (error) {
      if (isJwtError(error)) {
        logger.warn("Voice live: rejected — invalid or expired token");
        client.close(4001, "Unauthorized");
        return;
      }
      logger.error("Voice live auth error:", error);
      client.close(1011, "Auth error");
      return;
    }

    if (!env.DEEPGRAM_API_KEY) {
      client.close(1011, "Deepgram not configured");
      return;
    }

    logger.info(`Voice live: auth ok, opening Deepgram socket`);
    // The streaming endpoint supports a limited set of encodings (linear16,
    // opus, ogg-opus, flac, ...) — no webm/mp3. The browser captures raw
    // linear16 PCM via the Web Audio API, so declare it explicitly.
    const params = new URL(req.url || "/", "http://localhost").searchParams;
    const language = params.get("language") || "";
    const langParam = isValidLanguage(language) ? `&language=${language}` : "";
    const dg = new WebSocket(
      `${DEEPGRAM_LIVE_URL}?model=nova-3&smart_format=true&punctuate=true&interim_results=true&endpointing=400&encoding=linear16&sample_rate=48000${langParam}`,
      { headers: { Authorization: `Token ${env.DEEPGRAM_API_KEY}` } }
    );

    dg.on("open", () => logger.info("Voice live: Deepgram socket open"));
    dg.on("unexpected-response", (_req, res) => {
      logger.error(`Voice live: Deepgram handshake rejected HTTP ${res.statusCode}`);
      try { client.close(1011, `Deepgram rejected: ${res.statusCode}`); } catch { /* ignore */ }
    });
    dg.on("message", (data) => {
      if (client.readyState === WebSocket.OPEN) client.send(data.toString());
    });
    dg.on("close", (code, reason) => {
      logger.info(`Voice live: Deepgram socket closed code=${code} reason=${(reason?.toString() || "").slice(0, 120)}`);
      try { client.close(code || 1000, reason?.toString() || undefined); } catch { /* ignore */ }
    });
    dg.on("error", (error) => {
      logger.error("Deepgram live socket error:", error instanceof Error ? error.message : error);
      try { client.close(1011, "Deepgram error"); } catch { /* ignore */ }
    });

    client.on("message", (data) => {
      if (dg.readyState === WebSocket.OPEN) dg.send(data as any);
    });
    client.on("close", (code, reason) => {
      logger.info(`Voice live: browser disconnected code=${code}`);
      try { dg.close(); } catch { /* ignore */ }
    });
    client.on("error", () => {
      try { dg.close(); } catch { /* ignore */ }
    });
  });
}
