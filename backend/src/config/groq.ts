import Groq from "groq-sdk";
import { env } from "./env";

export const groq = new Groq({ apiKey: env.GROQ_API_KEY });

export const GROQ_MODELS = {
  LLAMA_70B: "llama-3.3-70b-versatile",
  LLAMA_8B: "llama-3.1-8b-instant",
  MIXTRAL: "mixtral-8x7b-32768",
  GEMMA: "gemma2-9b-it",
} as const;
