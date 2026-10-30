import { z } from "zod";

export const TurnIntentSchema = z.object({
  productMention: z.string().min(1).nullable(),
  planCode: z.enum(["STD", "CARE", "PRO"]).nullable(),
  requirementCount: z.number().int().positive().nullable(),
  priceObjection: z.boolean(),
  confirmBooking: z.boolean(),
  cancel: z.boolean(),
});

export type TurnIntent = z.infer<typeof TurnIntentSchema>;

export const TURN_INTENT_JSON_SCHEMA = {
  type: "object",
  properties: {
    productMention: { type: ["string", "null"] },
    planCode: { type: ["string", "null"], enum: ["STD", "CARE", "PRO", null] },
    requirementCount: { type: ["integer", "null"], minimum: 1 },
    priceObjection: { type: "boolean" },
    confirmBooking: { type: "boolean" },
    cancel: { type: "boolean" },
  },
  required: [
    "productMention",
    "planCode",
    "requirementCount",
    "priceObjection",
    "confirmBooking",
    "cancel",
  ],
  additionalProperties: false,
} as const;

// Gemini's responseSchema uses a smaller schema dialect than Groq's JSON Schema.
export const GEMINI_INTENT_SCHEMA = {
  type: "object",
  properties: {
    productMention: { type: "string", nullable: true },
    planCode: { type: "string", enum: ["STD", "CARE", "PRO"], nullable: true },
    requirementCount: { type: "integer", minimum: 1, nullable: true },
    priceObjection: { type: "boolean" },
    confirmBooking: { type: "boolean" },
    cancel: { type: "boolean" },
  },
  required: TURN_INTENT_JSON_SCHEMA.required,
} as const;
