import { createHash } from "node:crypto";
import { CATALOG } from "./catalog.js";
import type {
  DiscountTier,
  PlanCode,
  PromoCode,
  Quote,
  SkuId,
} from "./types.js";

const DISCOUNT_BY_TIER: Record<
  DiscountTier,
  { percent: 0 | 10 | 15; basisPoints: 0 | 1000 | 1500; promoCode: PromoCode }
> = {
  0: { percent: 0, basisPoints: 0, promoCode: null },
  1: { percent: 10, basisPoints: 1000, promoCode: "SAVE10" },
  2: { percent: 15, basisPoints: 1500, promoCode: "CLOSENOW15" },
};

export function calculateQuantity(requirement: number, capacity: number): number {
  if (!Number.isSafeInteger(requirement) || requirement <= 0) {
    throw new Error("Requirement must be a positive integer.");
  }
  if (!Number.isSafeInteger(capacity) || capacity <= 0) {
    throw new Error("Capacity must be a positive integer.");
  }
  return Math.ceil(requirement / capacity);
}

export function calculatePrice(
  skuId: SkuId,
  planCode: PlanCode,
  quantity: number,
  discountTier: DiscountTier,
): {
  unitPriceCents: number;
  baseTotalCents: number;
  finalPriceCents: number;
  discountPercent: 0 | 10 | 15;
  promoCode: PromoCode;
} {
  const unitPriceCents = CATALOG[skuId].plans[planCode];
  if (unitPriceCents === undefined) {
    throw new Error(`Plan ${planCode} is unavailable for ${skuId}.`);
  }
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error("Quantity must be a positive integer.");
  }

  const discount = DISCOUNT_BY_TIER[discountTier];
  const baseTotalCents = unitPriceCents * quantity;
  if (!Number.isSafeInteger(baseTotalCents)) {
    throw new Error("The requested quantity exceeds the supported price range.");
  }
  const finalPriceCents = Math.round(
    (baseTotalCents * (10000 - discount.basisPoints)) / 10000,
  );

  return {
    unitPriceCents,
    baseTotalCents,
    finalPriceCents,
    discountPercent: discount.percent,
    promoCode: discount.promoCode,
  };
}

export function quoteFingerprint(
  sessionId: string,
  quote: Pick<
    Quote,
    "skuId" | "planCode" | "quantity" | "promoCode" | "finalPriceCents" | "selectionVersion"
  >,
): string {
  return createHash("sha256")
    .update(
      [
        sessionId,
        quote.selectionVersion,
        quote.skuId,
        quote.planCode,
        quote.quantity,
        quote.promoCode ?? "NONE",
        quote.finalPriceCents,
      ].join("|"),
    )
    .digest("hex");
}

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function discountTierForPromo(promoCode: PromoCode): DiscountTier {
  if (promoCode === "SAVE10") return 1;
  if (promoCode === "CLOSENOW15") return 2;
  return 0;
}
