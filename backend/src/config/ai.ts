import Groq from "groq-sdk";
import { env } from "./env";

// Groq Client (Primary)
export const groq = new Groq({ apiKey: env.GROQ_API_KEY });

// Current models served on this account's Groq key (verified live).
// Mixtral-8x7b and Gemma 2 were decommissioned by Groq and no longer exist.
export const GROQ_MODELS = {
  LLAMA_70B: "llama-3.3-70b-versatile",
  LLAMA_8B: "llama-3.1-8b-instant",
  QWEN_27B: "qwen/qwen3.6-27b",
  GPT_OSS_120B: "openai/gpt-oss-120b",
  COMPOUND_MINI: "groq/compound-mini",
} as const;

// AI Provider configurations
export const AI_PROVIDERS = {
  groq: {
    name: "Groq",
    models: Object.values(GROQ_MODELS),
    default: GROQ_MODELS.LLAMA_70B,
  },
  gemini: {
    name: "Google Gemini",
    models: ["gemini-flash-latest"],
    default: "gemini-flash-latest",
    apiKey: env.GEMINI_API_KEY,
  },
  openrouter: {
    name: "OpenRouter",
    models: ["openai/gpt-4o", "deepseek/deepseek-chat"],
    default: "openai/gpt-4o",
    apiKey: env.OPENROUTER_API_KEY,
  },
} as const;

export type AIProvider = keyof typeof AI_PROVIDERS;
