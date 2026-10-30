import type { AppConfig } from "../config.js";
import type { SessionState } from "../domain/types.js";
import {
  GEMINI_INTENT_SCHEMA,
  TURN_INTENT_JSON_SCHEMA,
  TurnIntentSchema,
  type TurnIntent,
} from "./intent-schema.js";

const SYSTEM_PROMPT = `You extract intent for a sales application. Return only the supplied schema.

Rules:
- productMention is the product phrase exactly as the user expressed it, or null when no product is mentioned.
- planCode is STD, CARE, PRO, or null. "standard" means STD.
- requirementCount is the positive integer number of rooms, people, users, units, or devices requested. Do not treat model-generation numbers such as "2nd Gen" or "Wi-Fi 6E" as requirements.
- priceObjection is true for any complaint about price or request for a discount/promo, including invented promo codes.
- confirmBooking is true only for an explicit instruction to book, confirm, proceed, or an unambiguous yes.
- cancel is true when the user explicitly cancels or says not to book.
- Never calculate a price, quantity, SKU, discount, or booking payload.`;

export class IntentExtractionError extends Error {
  public constructor(message = "Intent extraction failed.", options?: ErrorOptions) {
    super(message, options);
    this.name = "IntentExtractionError";
  }
}

export interface IntentExtractor {
  extract(message: string, state: Readonly<SessionState>): Promise<TurnIntent>;
}

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

const PRODUCT_SIGNAL =
  /\b(air\s*pods?|aero\s*mesh|arrow\s*mesh|wi[ -]?fi|sync\s*hub|sink\s*hub|conference\s+bar|router|orbi|netgear|sku_|package|product)\b/i;

export function isExplicitBookingConfirmation(message: string): boolean {
  const normalized = message.trim();
  if (/\b(cancel|never mind|nevermind|do not book|don't book|stop booking)\b/i.test(normalized)) return false;
  if (/\b(maybe|perhaps|how do I|should I|what if)\b/i.test(normalized)) return false;
  return /\b(book it|book this|confirm (?:it|this|the (?:booking|order|purchase))|place (?:the )?(?:booking|order)|go ahead|proceed)\b/i.test(normalized)
    || /^(yes|yes please|okay|ok|sure|confirm)[.!\s]*$/i.test(normalized);
}

export function extractRequirement(message: string): number | null {
  const wordAlternatives = Object.keys(NUMBER_WORDS).join("|");
  const match = message.match(
    new RegExp(
      `\\b(\\d+|${wordAlternatives})\\s*(?:-|\\s)*(rooms?|people|persons?|users?|units?|devices?|seats?)\\b`,
      "i",
    ),
  );
  if (!match?.[1]) return null;
  const token = match[1].toLowerCase();
  const value = /^\d+$/.test(token) ? Number(token) : NUMBER_WORDS[token];
  return value && Number.isSafeInteger(value) && value > 0 ? value : null;
}

export class DeterministicIntentExtractor implements IntentExtractor {
  public async extract(
    message: string,
    _state?: Readonly<SessionState>,
  ): Promise<TurnIntent> {
    const normalized = message.trim();
    const productNameHasPro = /\bair\s*pods?\s+pro\b/i.test(normalized);
    const explicitProPlan = /\b(?:plan|on|tier)\s+(?:the\s+)?pro\b/i.test(normalized);
    const planCode = /\bcare\b/i.test(normalized)
      ? "CARE"
      : /\bpro\b/i.test(normalized) && (!productNameHasPro || explicitProPlan)
        ? "PRO"
        : /\b(std|standard)\b/i.test(normalized)
          ? "STD"
          : null;

    const priceObjection =
      /\b(expensive|pricey|cheaper|discount|promo|deal|lower|reduce|save\s*\d+|too much|costs? too much|best price|\d+\s*(?:%|percent)\s*off)\b/i.test(
        normalized,
      );
    const cancel =
      /\b(cancel|never mind|nevermind|do not book|don'?t book|stop booking)\b/i.test(normalized);
    const confirmBooking = !cancel && isExplicitBookingConfirmation(normalized);

    return TurnIntentSchema.parse({
      productMention: PRODUCT_SIGNAL.test(normalized) ? normalized : null,
      planCode,
      requirementCount: extractRequirement(normalized),
      priceObjection,
      confirmBooking,
      cancel,
    });
  }
}

export class GeminiIntentExtractor implements IntentExtractor {
  public constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  public async extract(message: string, state: Readonly<SessionState>): Promise<TurnIntent> {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        this.model,
      )}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: JSON.stringify({
                    currentStage: state.stage,
                    currentSelection: state.selection,
                    message,
                  }),
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: GEMINI_INTENT_SCHEMA,
          },
        }),
      });
      if (!response.ok) throw new Error(`Gemini returned HTTP ${response.status}.`);
      const body = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const content = body.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) throw new Error("Gemini returned no structured content.");
      return TurnIntentSchema.parse(JSON.parse(content));
    } catch (error) {
      throw new IntentExtractionError("Gemini intent extraction failed.", { cause: error });
    }
  }
}

export class GroqIntentExtractor implements IntentExtractor {
  public constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  public async extract(message: string, state: Readonly<SessionState>): Promise<TurnIntent> {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: JSON.stringify({
                currentStage: state.stage,
                currentSelection: state.selection,
                message,
              }),
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "turn_intent",
              strict: true,
              schema: TURN_INTENT_JSON_SCHEMA,
            },
          },
        }),
      });
      if (!response.ok) throw new Error(`Groq returned HTTP ${response.status}.`);
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new Error("Groq returned no structured content.");
      return TurnIntentSchema.parse(JSON.parse(content));
    } catch (error) {
      throw new IntentExtractionError("Groq intent extraction failed.", { cause: error });
    }
  }
}

class FallbackIntentExtractor implements IntentExtractor {
  public constructor(
    private readonly primary: IntentExtractor,
    private readonly fallback: IntentExtractor,
  ) {}

  public async extract(message: string, state: Readonly<SessionState>): Promise<TurnIntent> {
    try {
      return await this.primary.extract(message, state);
    } catch (error) {
      if (!(error instanceof IntentExtractionError)) throw error;
      return this.fallback.extract(message, state);
    }
  }
}

export function createIntentExtractor(config: AppConfig): IntentExtractor {
  const deterministic = new DeterministicIntentExtractor();
  if (config.intentMode === "deterministic") return deterministic;

  if (config.intentMode === "gemini") {
    if (!config.geminiApiKey) {
      if (config.allowDeterministicFallback) return deterministic;
      throw new Error("GEMINI_API_KEY is required when INTENT_MODE=gemini.");
    }
    const gemini = new GeminiIntentExtractor(
      config.geminiApiKey,
      config.geminiModel,
      config.llmTimeoutMs,
    );
    return config.allowDeterministicFallback
      ? new FallbackIntentExtractor(gemini, deterministic)
      : gemini;
  }

  if (!config.groqApiKey) {
    if (config.allowDeterministicFallback) return deterministic;
    throw new Error("GROQ_API_KEY is required when INTENT_MODE=groq.");
  }
  const groq = new GroqIntentExtractor(
    config.groqApiKey,
    config.groqModel,
    config.llmTimeoutMs,
  );
  return config.allowDeterministicFallback
    ? new FallbackIntentExtractor(groq, deterministic)
    : groq;
}
