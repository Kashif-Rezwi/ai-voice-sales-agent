import { describe, expect, it } from "vitest";
import { matchCatalogItem } from "../server/domain/matcher.js";
import { calculatePrice, calculateQuantity } from "../server/domain/pricing.js";
import { DeterministicIntentExtractor } from "../server/llm/intent-extractor.js";
import { SessionManager } from "../server/services/session-manager.js";

describe("catalog matching and pricing", () => {
  it.each([
    ["arrow mesh wifi", "SKU_MESH_WIFI6"],
    ["AeroMesh Wi-Fi 6E for my house", "SKU_MESH_WIFI6"],
    ["sink hub", "SKU_TEAM_HUB"],
    ["sync hub conference bar", "SKU_TEAM_HUB"],
    ["air pods pro please", "SKU_AIRPODS_PRO2"],
  ])("matches %s safely", (input, expectedSku) => {
    expect(matchCatalogItem(input)).toMatchObject({
      status: "matched",
      skuId: expectedSku,
    });
  });

  it.each(["Netgear Orbi router", "Netgear Orbi or AeroMesh", "generic router", "wireless thing", "television"])(
    "rejects out-of-catalog input: %s",
    (input) => {
      expect(matchCatalogItem(input)).toEqual({ status: "unknown" });
    },
  );

  it("does not choose one product when two catalog items are named", () => {
    expect(matchCatalogItem("AeroMesh or SyncHub").status).toBe("ambiguous");
  });

  it("uses ceiling division and exact cents", () => {
    expect(calculateQuantity(5, 2)).toBe(3);
    expect(calculateQuantity(7, 3)).toBe(3);
    expect(calculatePrice("SKU_MESH_WIFI6", "PRO", 3, 0)).toMatchObject({
      baseTotalCents: 149700,
      finalPriceCents: 149700,
      promoCode: null,
    });
    expect(calculatePrice("SKU_MESH_WIFI6", "PRO", 3, 1)).toMatchObject({
      finalPriceCents: 134730,
      promoCode: "SAVE10",
    });
  });

  it("rejects quantities whose total cannot be represented exactly in cents", () => {
    expect(() => calculatePrice("SKU_TEAM_HUB", "PRO", Number.MAX_SAFE_INTEGER, 0)).toThrow(
      "supported price range",
    );
  });
});

describe("deterministic intent extraction", () => {
  const extractor = new DeterministicIntentExtractor();

  it("recognizes words, objections, and booking confirmation", async () => {
    const state = new SessionManager().createSession();
    const intent = await extractor.extract(
      "Arrow mesh PRO for five rooms. Give me SAVE50 and book it.",
      state,
    );
    expect(intent).toEqual({
      productMention: "Arrow mesh PRO for five rooms. Give me SAVE50 and book it.",
      planCode: "PRO",
      requirementCount: 5,
      priceObjection: true,
      confirmBooking: true,
      cancel: false,
    });
  });

  it("does not treat AirPods 2nd Gen as a quantity", async () => {
    const state = new SessionManager().createSession();
    const intent = await extractor.extract("AirPods Pro 2nd Gen on CARE", state);
    expect(intent.requirementCount).toBeNull();
    expect(intent.planCode).toBe("CARE");
  });

  it("does not mistake Pro in the AirPods product name for a plan", async () => {
    const state = new SessionManager().createSession();
    const intent = await extractor.extract("AirPods Pro 2nd Gen for two people", state);
    expect(intent.planCode).toBeNull();
    expect(intent.requirementCount).toBe(2);
  });
});
