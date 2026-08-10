import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("5000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),

  // AI Providers
  GROQ_API_KEY: z.string().min(1, "GROQ_API_KEY is required"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MEDIA_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  NVIDIA_NIM_API_KEY: z.string().optional(),
  NVIDIA_IMAGE_API_KEY: z.string().optional(),
  FAL_API_KEY: z.string().optional(),
  APIFRAME_API_KEY: z.string().optional(),
  PIXAZO_API_KEY: z.string().optional(),
  JSON2VIDEO_API_KEY: z.string().optional(),
  VADOO_API_KEY: z.string().optional(),
  DEEPGRAM_API_KEY: z.string().optional(),
  JINA_API_KEY: z.string().optional(),
  OPENWEATHER_API_KEY: z.string().optional(),

  FRONTEND_URL: z.string().min(1, "FRONTEND_URL is required"),

  // Supabase Auth (optional — when set, login/register go through Supabase)
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  FILE_PROCESSOR_URL: z.string().default("http://localhost:8000"),
  FILE_PROCESSOR_TIMEOUT: z.string().default("300000"),
  ENABLE_FILE_PROCESSOR: z.string().default("true"),

  // OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  SESSION_SECRET: z.string().optional(),

  // Email
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  FROM_EMAIL: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
