import "dotenv/config";
import { z } from "zod";

const booleanFromEnv = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  BOOKING_LATENCY_MS: z.coerce.number().int().nonnegative().default(1500),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  INTENT_MODE: z
    .enum(["deterministic", "gemini", "groq"])
    .default("gemini"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.1-flash-lite"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().min(1).default("openai/gpt-oss-20b"),
  ALLOW_DETERMINISTIC_FALLBACK: booleanFromEnv.default(true),
});

export interface AppConfig {
  port: number;
  bookingLatencyMs: number;
  llmTimeoutMs: number;
  intentMode: "deterministic" | "gemini" | "groq";
  geminiApiKey?: string;
  geminiModel: string;
  groqApiKey?: string;
  groqModel: string;
  allowDeterministicFallback: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.parse(env);

  return {
    port: parsed.PORT,
    bookingLatencyMs: parsed.BOOKING_LATENCY_MS,
    llmTimeoutMs: parsed.LLM_TIMEOUT_MS,
    intentMode: parsed.INTENT_MODE,
    ...(parsed.GEMINI_API_KEY ? { geminiApiKey: parsed.GEMINI_API_KEY } : {}),
    geminiModel: parsed.GEMINI_MODEL,
    ...(parsed.GROQ_API_KEY ? { groqApiKey: parsed.GROQ_API_KEY } : {}),
    groqModel: parsed.GROQ_MODEL,
    allowDeterministicFallback: parsed.ALLOW_DETERMINISTIC_FALLBACK,
  };
}
