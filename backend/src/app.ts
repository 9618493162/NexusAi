import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import passport from "./config/passport";
import { env } from "./config/env";
import { globalRateLimit } from "./middleware/rate-limit.middleware";
import { errorHandler } from "./middleware/error.middleware";
import { logger } from "./config/logger";

// Routes
import authRoutes from "./routes/auth.routes";
import chatRoutes from "./routes/chat.routes";
import fileRoutes from "./routes/file.routes";
import imageRoutes from "./routes/image.routes";
import videoRoutes from "./routes/video.routes";
import usageRoutes from "./routes/usage.routes";
import providersRoutes from "./routes/providers.routes";
import voiceRoutes from "./routes/voice.routes";
import settingsRoutes from "./routes/settings.routes";
import { attachVoiceLiveProxy } from "./services/voice.live";

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "ws:", "wss:"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
}));
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(compression());
app.use(morgan("combined"));
app.use(globalRateLimit);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/image", imageRoutes);
app.use("/api/video", videoRoutes);
app.use("/api/usage", usageRoutes);
app.use("/api/providers", providersRoutes);
app.use("/api/voice", voiceRoutes);
app.use("/api/settings", settingsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// Error handler
app.use(errorHandler);

const PORT = parseInt(env.PORT);
const server = app.listen(PORT, () => {
  logger.info(`NexusAI backend running on port ${PORT}`);
});

// Deepgram live transcription proxy (browser WebSocket -> Deepgram).
attachVoiceLiveProxy(server);
