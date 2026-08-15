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
import searchRoutes from "./routes/search.routes";
import projectRoutes from "./routes/project.routes";
import meetingRoutes from "./routes/meeting.routes";
import workflowRoutes from "./routes/workflow.routes";
import dataRoutes from "./routes/data.routes";
import researchRoutes from "./routes/research.routes";
import documentRoutes from "./routes/document.routes";
import marketRoutes from "./routes/market.routes";
import agentRoutes from "./routes/agent.routes";
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
const allowedOrigins = [
  env.FRONTEND_URL,
  ...(env.CORS_ORIGINS ? env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean) : []),
];
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow same-origin / non-browser (curl, server-to-server) requests.
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  })
);
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
app.use("/api/search", searchRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/workflows", workflowRoutes);
app.use("/api/data", dataRoutes);
app.use("/api/research", researchRoutes);
app.use("/api/market", marketRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/agents", agentRoutes);

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
