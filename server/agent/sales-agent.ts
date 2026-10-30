import { randomUUID } from "node:crypto";
import {
  availablePlans,
  CATALOG,
  getCatalogInfo,
  isPlanAvailable,
} from "../domain/catalog.js";
import { matchCatalogItem, normalizeProductText } from "../domain/matcher.js";
import {
  calculatePrice,
  calculateQuantity,
  formatUsd,
  quoteFingerprint,
} from "../domain/pricing.js";
import type {
  AgentTurnResponse,
  BookingInput,
  DiscountTier,
  Quote,
  SessionState,
  ToolEvent,
} from "../domain/types.js";
import { extractRequirement, isExplicitBookingConfirmation, type IntentExtractor } from "../llm/intent-extractor.js";
import { BookingService } from "../services/booking-service.js";
import {
  SessionManager,
  type LockedSession,
} from "../services/session-manager.js";

export class SalesAgent {
  public constructor(
    private readonly sessions: SessionManager,
    private readonly intentExtractor: IntentExtractor,
    private readonly bookings: BookingService,
  ) {}

  public createSession(): SessionState {
    return this.sessions.createSession();
  }

  public getSession(sessionId: string): SessionState {
    return this.sessions.getState(sessionId);
  }

  public async handleMessage(
    sessionId: string,
    requestId: string,
    rawMessage: string,
  ): Promise<AgentTurnResponse> {
    const message = rawMessage.trim();
    if (!message) throw new Error("Message cannot be empty.");
    if (!requestId.trim()) throw new Error("requestId cannot be empty.");

    return this.sessions.withLock(sessionId, async (session) => {
      const cached = session.responseCache.get(requestId);
      if (cached) return structuredClone(cached);

      const state = session.state;
      const firstToolIndex = state.toolEvents.length;
      if (state.stage === "BOOKED" && state.booking.record) {
        state.turnCounter += 1;
        return this.finishTurn(
          session,
          requestId,
          `This session is already booked as ${state.booking.record.booking_id}. Start a new session to create another order.`,
          firstToolIndex,
        );
      }

      const intent = await this.intentExtractor.extract(message, structuredClone(state));
      state.turnCounter += 1;

      if (!state.catalogFetched) {
        this.fetchCatalog(state, requestId, message);
      }

      if (intent.cancel) {
        this.clearSelection(state);
        return this.finishTurn(
          session,
          requestId,
          "Cancelled. No booking was created, and the current quote has been cleared.",
          firstToolIndex,
        );
      }

      const selection = { ...state.selection };
      let discountTier = state.discountTier;
      let changed = false;
      let invalidProduct = false;
      let validationMessage: string | null = null;

      const directMatch = matchCatalogItem(message);
      const groundedMention = intent.productMention !== null &&
        normalizeProductText(message).includes(normalizeProductText(intent.productMention));
      const productWasMentioned =
        groundedMention || directMatch.status !== "unknown" ||
        /\b(netgear|orbi|router)\b/i.test(message);
      if (productWasMentioned) {
        const match = directMatch.status === "ambiguous" || /\b(netgear|orbi)\b/i.test(message)
          ? directMatch
          : matchCatalogItem(groundedMention ? intent.productMention! : message);
        if (match.status === "unknown") {
          invalidProduct = true;
          validationMessage =
            "That product is not in our catalog. I can only offer AirPods Pro 2nd Gen, AeroMesh Wi-Fi 6E Home Pack, or SyncHub Conference Bar. Nothing has been booked.";
        } else if (match.status === "ambiguous") {
          invalidProduct = true;
          validationMessage =
            "I could not identify one catalog product with enough confidence. Please say AirPods Pro 2, AeroMesh Wi-Fi 6E, or SyncHub Conference Bar. Nothing has been booked.";
        } else if (selection.skuId !== match.skuId) {
          const priorPlan = selection.planCode;
          selection.skuId = match.skuId;
          selection.planCode =
            priorPlan && isPlanAvailable(match.skuId, priorPlan) ? priorPlan : null;
          discountTier = 0;
          changed = true;
        }
      }

      if (!validationMessage && intent.planCode) {
        if (!selection.skuId) {
          validationMessage = "Please choose a catalog package before selecting a plan.";
        } else if (!isPlanAvailable(selection.skuId, intent.planCode)) {
          validationMessage = `${intent.planCode} is not available for ${
            CATALOG[selection.skuId].name
          }. Available plans: ${availablePlans(selection.skuId).join(", ")}. Nothing has been booked.`;
        } else if (selection.planCode !== intent.planCode) {
          selection.planCode = intent.planCode;
          changed = true;
        }
      }

      const requirementCount = extractRequirement(message) ?? intent.requirementCount;
      if (!validationMessage && requirementCount !== null) {
        if (selection.requirementCount !== requirementCount) {
          selection.requirementCount = requirementCount;
          changed = true;
        }
      }

      if (changed && !validationMessage) {
        state.selection = selection;
        state.discountTier = discountTier;
        state.selectionVersion += 1;
        state.quote = null;
        state.stage = "COLLECTING";
        state.booking = {
          status: "IDLE",
          idempotencyKey: null,
          record: null,
          error: null,
        };
        if (selection.skuId && selection.requirementCount) {
          selection.quantity = calculateQuantity(
            selection.requirementCount,
            CATALOG[selection.skuId].maxCapacityPerUnit,
          );
        } else {
          selection.quantity = null;
        }
      }

      if (validationMessage) {
        if (invalidProduct) this.clearSelection(state);
        return this.finishTurn(
          session,
          requestId,
          validationMessage,
          firstToolIndex,
        );
      }

      if (!selection.skuId || !selection.planCode || !selection.requirementCount) {
        return this.finishTurn(
          session,
          requestId,
          this.renderMissingDetails(state),
          firstToolIndex,
        );
      }

      if (!state.quote || state.quote.selectionVersion !== state.selectionVersion) {
        const quote = this.createQuote(state);
        return this.finishTurn(
          session,
          requestId,
          this.renderQuote(quote, "quote"),
          firstToolIndex,
        );
      }

      if (intent.priceObjection) {
        if (state.discountTier < 2) {
          state.discountTier = (state.discountTier + 1) as DiscountTier;
          const quote = this.createQuote(state);
          return this.finishTurn(
            session,
            requestId,
            this.renderQuote(quote, "discount"),
            firstToolIndex,
          );
        }
        return this.finishTurn(
          session,
          requestId,
          `CLOSENOW15 is the absolute maximum discount. ${this.renderQuote(
            state.quote,
            "maximum",
          )}`,
          firstToolIndex,
        );
      }

      if (intent.confirmBooking && isExplicitBookingConfirmation(message)) {
        if (
          state.quote.selectionVersion !== state.selectionVersion ||
          state.quote.presentedAtTurn >= state.turnCounter
        ) {
          const quote = this.createQuote(state);
          return this.finishTurn(
            session,
            requestId,
            `Your requirements changed, so I need confirmation on the updated quote. ${this.renderQuote(
              quote,
              "quote",
            )}`,
            firstToolIndex,
          );
        }
        return this.executeBooking(session, requestId, firstToolIndex);
      }

      return this.finishTurn(
        session,
        requestId,
        `${this.renderQuote(state.quote, "reminder")} Reply "Yes, book it" to confirm, or tell me what to change.`,
        firstToolIndex,
      );
    });
  }

  private clearSelection(state: SessionState): void {
    state.selectionVersion += 1;
    state.discountTier = 0;
    state.selection = { skuId: null, planCode: null, requirementCount: null, quantity: null };
    state.quote = null;
    state.stage = "COLLECTING";
    state.booking = { status: "IDLE", idempotencyKey: null, record: null, error: null };
  }

  private fetchCatalog(state: SessionState, requestId: string, query: string): void {
    const started = Date.now();
    const output = getCatalogInfo();
    state.catalogFetched = true;
    state.toolEvents.push(
      this.toolEvent({
        state,
        requestId,
        toolName: "get_catalog_info",
        input: { query },
        output,
        status: "SUCCEEDED",
        deduplicated: false,
        started,
      }),
    );
  }

  private createQuote(state: SessionState): Quote {
    const { skuId, planCode, requirementCount, quantity } = state.selection;
    if (!skuId || !planCode || !requirementCount || !quantity) {
      throw new Error("Cannot create a quote from an incomplete selection.");
    }
    const price = calculatePrice(skuId, planCode, quantity, state.discountTier);
    state.quoteCounter += 1;
    const quoteWithoutFingerprint = {
      version: state.quoteCounter,
      selectionVersion: state.selectionVersion,
      presentedAtTurn: state.turnCounter,
      skuId,
      packageName: CATALOG[skuId].name,
      planCode,
      requirementCount,
      quantity,
      discountTier: state.discountTier,
      ...price,
    };
    const quote: Quote = {
      ...quoteWithoutFingerprint,
      fingerprint: quoteFingerprint(state.sessionId, quoteWithoutFingerprint),
    };
    state.quote = quote;
    state.stage = "AWAITING_CONFIRMATION";
    return quote;
  }

  private async executeBooking(
    session: LockedSession,
    requestId: string,
    firstToolIndex: number,
  ): Promise<AgentTurnResponse> {
    const state = session.state;
    const quote = state.quote;
    if (!quote) throw new Error("A current quote is required before booking.");

    const payload: BookingInput = {
      sku_id: quote.skuId,
      plan_code: quote.planCode,
      quantity: quote.quantity,
      promo_code: quote.promoCode,
      final_price: quote.finalPriceCents / 100,
    };
    const idempotencyKey = quote.fingerprint;
    state.stage = "BOOKING";
    state.booking = {
      status: "IN_FLIGHT",
      idempotencyKey,
      record: null,
      error: null,
    };
    const started = Date.now();

    try {
      const result = await this.bookings.createBooking(payload, idempotencyKey);
      state.booking = {
        status: "SUCCEEDED",
        idempotencyKey,
        record: result.record,
        error: null,
      };
      state.stage = "BOOKED";
      state.toolEvents.push(
        this.toolEvent({
          state,
          requestId,
          toolName: "create_booking",
          input: { ...payload, idempotency_key: idempotencyKey },
          output: result.record,
          status: "SUCCEEDED",
          deduplicated: result.deduplicated,
          started,
        }),
      );
      return this.finishTurn(
        session,
        requestId,
        `Booked successfully. Booking ID: ${result.record.booking_id}. ${quote.packageName}, plan ${quote.planCode}, quantity ${quote.quantity}, promo code ${
          quote.promoCode ?? "none"
        }, final price ${formatUsd(quote.finalPriceCents)}.`,
        firstToolIndex,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown booking error.";
      state.booking = {
        status: "FAILED",
        idempotencyKey,
        record: null,
        error: errorMessage,
      };
      state.stage = "BOOKING_FAILED";
      state.toolEvents.push(
        this.toolEvent({
          state,
          requestId,
          toolName: "create_booking",
          input: { ...payload, idempotency_key: idempotencyKey },
          output: { error: errorMessage },
          status: "FAILED",
          deduplicated: false,
          started,
        }),
      );
      return this.finishTurn(
        session,
        requestId,
        "The booking was not completed. Your exact quote is unchanged; say \"Yes, book it\" to retry safely with the same idempotency key.",
        firstToolIndex,
      );
    }
  }

  private renderMissingDetails(state: SessionState): string {
    const missing: string[] = [];
    if (!state.selection.skuId) missing.push("a catalog package");
    if (!state.selection.planCode) missing.push("a plan");
    if (!state.selection.requirementCount) missing.push("the number of rooms or people");
    const prefix = state.selection.skuId
      ? `Selected ${CATALOG[state.selection.skuId].name}. `
      : "";
    return `${prefix}Please provide ${missing.join(", ")}. Nothing has been booked.`;
  }

  private renderQuote(
    quote: Quote,
    mode: "quote" | "discount" | "maximum" | "reminder",
  ): string {
    const item = CATALOG[quote.skuId];
    const promo = quote.promoCode ?? "none";
    const discountLead =
      mode === "discount"
        ? `I can offer ${promo} (${quote.discountPercent}% off). `
        : mode === "quote" && quote.discountTier === 0
          ? "Here is the standard-price quote. "
          : "";
    return `${discountLead}${quote.packageName}; plan ${quote.planCode}; requirement ${quote.requirementCount}; capacity ${item.maxCapacityPerUnit} per unit, so exact quantity ${quote.quantity}; standard total ${formatUsd(
      quote.baseTotalCents,
    )}; promo code ${promo}; final price ${formatUsd(
      quote.finalPriceCents,
    )}. This quote must be explicitly confirmed before booking.`;
  }

  private finishTurn(
    session: LockedSession,
    requestId: string,
    assistantMessage: string,
    firstToolIndex: number,
  ): AgentTurnResponse {
    session.state.updatedAt = new Date().toISOString();
    const response: AgentTurnResponse = {
      sessionId: session.state.sessionId,
      requestId,
      assistantMessage,
      state: structuredClone(session.state),
      toolCalls: structuredClone(session.state.toolEvents.slice(firstToolIndex)),
      turnVersion: session.state.turnCounter,
    };
    session.responseCache.set(requestId, structuredClone(response));
    return response;
  }

  private toolEvent(input: {
    state: SessionState;
    requestId: string;
    toolName: ToolEvent["toolName"];
    input: unknown;
    output: unknown;
    status: ToolEvent["status"];
    deduplicated: boolean;
    started: number;
  }): ToolEvent {
    const finished = Date.now();
    return {
      id: `tool_${randomUUID()}`,
      turn: input.state.turnCounter,
      requestId: input.requestId,
      toolName: input.toolName,
      input: input.input,
      output: input.output,
      status: input.status,
      deduplicated: input.deduplicated,
      startedAt: new Date(input.started).toISOString(),
      finishedAt: new Date(finished).toISOString(),
      durationMs: finished - input.started,
    };
  }
}
