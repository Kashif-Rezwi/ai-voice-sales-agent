import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GeminiIntentExtractor,
  GroqIntentExtractor,
  IntentExtractionError,
} from "../server/llm/intent-extractor.js";
import { SessionManager } from "../server/services/session-manager.js";

const STRUCTURED_INTENT = {
  productMention: "arrow mesh wifi",
  planCode: "PRO",
  requirementCount: 5,
  priceObjection: false,
  confirmBooking: false,
  cancel: false,
};

function initialState() {
  return new SessionManager().createSession();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("free-tier intent provider adapters", () => {
  it("requests schema-constrained JSON from Gemini", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: JSON.stringify(STRUCTURED_INTENT) }] } },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const extractor = new GeminiIntentExtractor("test-key", "gemini-test", 1000);
    await expect(
      extractor.extract("Arrow mesh wifi PRO for five rooms", initialState()),
    ).resolves.toEqual(STRUCTURED_INTENT);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("models/gemini-test:generateContent");
    expect(url).toContain("key=test-key");
    const body = JSON.parse(String(init.body)) as {
      generationConfig: { responseMimeType: string; responseSchema: { properties: Record<string, unknown>; additionalProperties?: boolean } };
    };
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema.properties.productMention).toEqual({ type: "string", nullable: true });
    expect(body.generationConfig.responseSchema.additionalProperties).toBeUndefined();
  });

  it("requests strict JSON Schema output from Groq", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(STRUCTURED_INTENT) } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const extractor = new GroqIntentExtractor("test-key", "openai/gpt-oss-20b", 1000);
    await expect(
      extractor.extract("Arrow mesh wifi PRO for five rooms", initialState()),
    ).resolves.toEqual(STRUCTURED_INTENT);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer test-key");
    const body = JSON.parse(String(init.body)) as {
      response_format: { type: string; json_schema: { strict: boolean } };
    };
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { strict: true },
    });
  });

  it("fails closed when a provider returns invalid intent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: '{"confirmBooking":true}' }] } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const extractor = new GeminiIntentExtractor("test-key", "gemini-test", 1000);
    await expect(extractor.extract("book it", initialState())).rejects.toBeInstanceOf(
      IntentExtractionError,
    );
  });
});
