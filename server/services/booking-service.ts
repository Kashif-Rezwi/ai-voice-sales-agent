import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { CATALOG, isPlanAvailable } from "../domain/catalog.js";
import { calculatePrice, discountTierForPromo } from "../domain/pricing.js";
import type { BookingInput, BookingRecord } from "../domain/types.js";

const bookingInputSchema = z.object({
  sku_id: z.enum(["SKU_AIRPODS_PRO2", "SKU_MESH_WIFI6", "SKU_TEAM_HUB"]),
  plan_code: z.enum(["STD", "CARE", "PRO"]),
  quantity: z.number().int().positive(),
  promo_code: z.enum(["SAVE10", "CLOSENOW15"]).nullable(),
  final_price: z.number().finite().nonnegative(),
});

export class BookingValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "BookingValidationError";
  }
}

export interface BookingResult {
  record: BookingRecord;
  deduplicated: boolean;
}

export class BookingService {
  private readonly completed = new Map<string, BookingRecord>();
  private readonly inFlight = new Map<string, Promise<BookingRecord>>();
  private readonly payloadHashes = new Map<string, string>();
  private executionCount = 0;

  public constructor(private readonly latencyMs = 1500) {}

  public async createBooking(
    rawInput: BookingInput,
    idempotencyKey: string,
  ): Promise<BookingResult> {
    if (!idempotencyKey.trim()) {
      throw new BookingValidationError("Idempotency-Key is required.");
    }
    const input = this.validateInput(rawInput);
    const payloadHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const knownHash = this.payloadHashes.get(idempotencyKey);
    if (knownHash && knownHash !== payloadHash) {
      throw new BookingValidationError(
        "The idempotency key was already used with a different booking payload.",
      );
    }
    this.payloadHashes.set(idempotencyKey, payloadHash);

    const completed = this.completed.get(idempotencyKey);
    if (completed) return { record: completed, deduplicated: true };

    const existingPromise = this.inFlight.get(idempotencyKey);
    if (existingPromise) {
      return { record: await existingPromise, deduplicated: true };
    }

    const operation = this.executeBooking(input, idempotencyKey);
    this.inFlight.set(idempotencyKey, operation);
    try {
      return { record: await operation, deduplicated: false };
    } finally {
      this.inFlight.delete(idempotencyKey);
    }
  }

  public getExecutionCount(): number {
    return this.executionCount;
  }

  private validateInput(rawInput: BookingInput): BookingInput {
    const input = bookingInputSchema.parse(rawInput);
    if (!isPlanAvailable(input.sku_id, input.plan_code)) {
      throw new BookingValidationError(
        `Plan ${input.plan_code} is unavailable for ${CATALOG[input.sku_id].name}.`,
      );
    }

    const expected = calculatePrice(
      input.sku_id,
      input.plan_code,
      input.quantity,
      discountTierForPromo(input.promo_code),
    );
    const submittedCents = Math.round(input.final_price * 100);
    if (Math.abs(input.final_price * 100 - submittedCents) > 0.000001) {
      throw new BookingValidationError("Final price must have at most two decimal places.");
    }
    if (submittedCents !== expected.finalPriceCents) {
      throw new BookingValidationError(
        `Final price is invalid; expected ${(expected.finalPriceCents / 100).toFixed(2)}.`,
      );
    }
    return input;
  }

  private async executeBooking(
    input: BookingInput,
    idempotencyKey: string,
  ): Promise<BookingRecord> {
    this.executionCount += 1;
    await delay(this.latencyMs);
    const record: BookingRecord = {
      ...input,
      booking_id: `book_${randomUUID()}`,
      idempotency_key: idempotencyKey,
      created_at: new Date().toISOString(),
    };
    this.completed.set(idempotencyKey, record);
    return record;
  }
}
