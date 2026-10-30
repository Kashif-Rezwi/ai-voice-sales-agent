import { beforeEach, describe, expect, it } from "vitest";
import { SalesAgent } from "../server/agent/sales-agent.js";
import { DeterministicIntentExtractor, type IntentExtractor } from "../server/llm/intent-extractor.js";
import { BookingService } from "../server/services/booking-service.js";
import { SessionManager } from "../server/services/session-manager.js";

describe("sales agent guardrails", () => {
  let bookingService: BookingService;
  let agent: SalesAgent;

  beforeEach(() => {
    bookingService = new BookingService(5);
    agent = new SalesAgent(
      new SessionManager(),
      new DeterministicIntentExtractor(),
      bookingService,
    );
  });

  it("quotes the exact AeroMesh quantity and standard total", async () => {
    const session = agent.createSession();
    const result = await agent.handleMessage(
      session.sessionId,
      "turn-1",
      "Arrow mesh wifi PRO for five rooms",
    );

    expect(result.state.selection).toEqual({
      skuId: "SKU_MESH_WIFI6",
      planCode: "PRO",
      requirementCount: 5,
      quantity: 3,
    });
    expect(result.state.quote).toMatchObject({
      promoCode: null,
      discountPercent: 0,
      finalPriceCents: 149700,
    });
    expect(result.assistantMessage).toContain("exact quantity 3");
    expect(result.assistantMessage).toContain("$1,497.00");
    expect(result.toolCalls.map((tool) => tool.toolName)).toEqual(["get_catalog_info"]);
  });

  it("rejects unknown products without selecting or booking", async () => {
    const session = agent.createSession();
    const result = await agent.handleMessage(
      session.sessionId,
      "turn-1",
      "I want a Netgear Orbi router for five rooms",
    );

    expect(result.assistantMessage).toContain("not in our catalog");
    expect(result.state.selection.skuId).toBeNull();
    expect(result.state.booking.status).toBe("IDLE");
    expect(bookingService.getExecutionCount()).toBe(0);
  });

  it("never skips or exceeds discount tiers", async () => {
    const session = agent.createSession();
    const standard = await agent.handleMessage(
      session.sessionId,
      "turn-1",
      "AeroMesh PRO for 5 rooms and give me 15 percent off",
    );
    expect(standard.state.quote?.promoCode).toBeNull();

    const first = await agent.handleMessage(
      session.sessionId,
      "turn-2",
      "Apply SAVE50, that is too expensive",
    );
    expect(first.state.quote).toMatchObject({ promoCode: "SAVE10", discountPercent: 10 });
    expect(first.assistantMessage).not.toContain("promo code SAVE50");

    const second = await agent.handleMessage(
      session.sessionId,
      "turn-3",
      "Still too expensive",
    );
    expect(second.state.quote).toMatchObject({
      promoCode: "CLOSENOW15",
      discountPercent: 15,
    });

    const third = await agent.handleMessage(
      session.sessionId,
      "turn-4",
      "I need a bigger discount",
    );
    expect(third.state.discountTier).toBe(2);
    expect(third.state.quote?.promoCode).toBe("CLOSENOW15");
    expect(third.assistantMessage).toContain("absolute maximum");
  });

  it("requotes requirement changes before accepting confirmation", async () => {
    const session = agent.createSession();
    await agent.handleMessage(
      session.sessionId,
      "turn-1",
      "AeroMesh STD for four rooms",
    );
    await agent.handleMessage(session.sessionId, "turn-2", "That is expensive");

    const changed = await agent.handleMessage(
      session.sessionId,
      "turn-3",
      "Switch to seven rooms and book it",
    );
    expect(changed.state.selection.quantity).toBe(4);
    expect(changed.state.quote?.promoCode).toBe("SAVE10");
    expect(changed.state.stage).toBe("AWAITING_CONFIRMATION");
    expect(changed.state.booking.status).toBe("IDLE");
    expect(bookingService.getExecutionCount()).toBe(0);

    const booked = await agent.handleMessage(
      session.sessionId,
      "turn-4",
      "Yes, book it",
    );
    expect(booked.state.stage).toBe("BOOKED");
    expect(booked.state.booking.record?.quantity).toBe(4);
    expect(bookingService.getExecutionCount()).toBe(1);
  });

  it("preserves tier for plan changes and resets it for SKU changes", async () => {
    const session = agent.createSession();
    await agent.handleMessage(
      session.sessionId,
      "turn-1",
      "AeroMesh STD for four rooms",
    );
    await agent.handleMessage(session.sessionId, "turn-2", "Too expensive");

    const planChanged = await agent.handleMessage(
      session.sessionId,
      "turn-3",
      "Switch to PRO",
    );
    expect(planChanged.state.discountTier).toBe(1);
    expect(planChanged.state.quote?.promoCode).toBe("SAVE10");

    const skuChanged = await agent.handleMessage(
      session.sessionId,
      "turn-4",
      "Switch to sink hub for seven people",
    );
    expect(skuChanged.state.selection).toMatchObject({
      skuId: "SKU_TEAM_HUB",
      planCode: "PRO",
      requirementCount: 7,
      quantity: 3,
    });
    expect(skuChanged.state.discountTier).toBe(0);
    expect(skuChanged.state.quote?.promoCode).toBeNull();
  });

  it("does not book on premature or stale confirmation", async () => {
    const session = agent.createSession();
    const premature = await agent.handleMessage(
      session.sessionId,
      "turn-1",
      "Yes, book it",
    );
    expect(premature.state.stage).toBe("COLLECTING");
    expect(bookingService.getExecutionCount()).toBe(0);

    await agent.handleMessage(
      session.sessionId,
      "turn-2",
      "AeroMesh PRO for five rooms",
    );
    const invalidSwitch = await agent.handleMessage(
      session.sessionId,
      "turn-3",
      "Switch to Netgear Orbi and book it",
    );
    expect(invalidSwitch.assistantMessage).toContain("not in our catalog");
    expect(invalidSwitch.state.stage).toBe("COLLECTING");
    expect(invalidSwitch.state.selection.skuId).toBeNull();
    const laterYes = await agent.handleMessage(session.sessionId, "turn-4", "Yes, book it");
    expect(laterYes.state.stage).toBe("COLLECTING");
    expect(bookingService.getExecutionCount()).toBe(0);
  });

  it("serializes concurrent confirmations and books once", async () => {
    const session = agent.createSession();
    await agent.handleMessage(
      session.sessionId,
      "turn-1",
      "Sync hub PRO for seven people",
    );

    const [first, second] = await Promise.all([
      agent.handleMessage(session.sessionId, "confirm-a", "Yes, book it"),
      agent.handleMessage(session.sessionId, "confirm-b", "Yes, book it"),
    ]);
    expect(first.state.booking.record?.booking_id).toBeTruthy();
    expect(second.assistantMessage).toContain(first.state.booking.record!.booking_id);
    expect(bookingService.getExecutionCount()).toBe(1);
    expect(agent.getSession(session.sessionId).toolEvents.filter(
      (event) => event.toolName === "create_booking",
    )).toHaveLength(1);
  });

  it("returns the cached response for a duplicate request ID", async () => {
    const session = agent.createSession();
    await agent.handleMessage(
      session.sessionId,
      "turn-1",
      "AirPods CARE for two people",
    );
    const [first, duplicate] = await Promise.all([
      agent.handleMessage(session.sessionId, "same-confirm", "Yes, book it"),
      agent.handleMessage(session.sessionId, "same-confirm", "Yes, book it"),
    ]);
    expect(duplicate).toEqual(first);
    expect(bookingService.getExecutionCount()).toBe(1);
  });

  it("does not partially change a confirmed selection for an unavailable plan", async () => {
    const session = agent.createSession();
    const quoted = await agent.handleMessage(session.sessionId, "one", "AeroMesh PRO for five rooms");
    const rejected = await agent.handleMessage(session.sessionId, "two", "Switch to AirPods on the PRO plan and book it");
    expect(rejected.assistantMessage).toContain("PRO is not available");
    expect(rejected.state.selection).toEqual(quoted.state.selection);
    expect(rejected.state.selectionVersion).toBe(quoted.state.selectionVersion);
    expect(rejected.state.quote).toEqual(quoted.state.quote);
    expect(bookingService.getExecutionCount()).toBe(0);
  });

  it("requires explicit user wording even if model claims confirmation", async () => {
    const misleadingExtractor: IntentExtractor = {
      extract: async (message, state) => ({
        productMention: state.selection.skuId ? null : "AeroMesh",
        planCode: state.selection.planCode ? null : "PRO",
        requirementCount: state.selection.requirementCount ? null : 5,
        priceObjection: false,
        confirmBooking: true,
        cancel: false,
      }),
    };
    const guarded = new SalesAgent(new SessionManager(), misleadingExtractor, bookingService);
    const session = guarded.createSession();
    await guarded.handleMessage(session.sessionId, "one", "AeroMesh PRO for five rooms");
    const reply = await guarded.handleMessage(session.sessionId, "two", "What is the price?");
    expect(reply.state.stage).toBe("AWAITING_CONFIRMATION");
    expect(bookingService.getExecutionCount()).toBe(0);
  });

  it("rejects an outside brand even if extraction suggests a catalog SKU", async () => {
    const misleadingExtractor: IntentExtractor = {
      extract: async () => ({
        productMention: "AeroMesh",
        planCode: "PRO",
        requirementCount: 5,
        priceObjection: false,
        confirmBooking: true,
        cancel: false,
      }),
    };
    const guarded = new SalesAgent(new SessionManager(), misleadingExtractor, bookingService);
    const session = guarded.createSession();
    const result = await guarded.handleMessage(session.sessionId, "one", "Netgear Orbi or AeroMesh PRO for five rooms, book it");
    expect(result.state.selection.skuId).toBeNull();
    expect(result.state.booking.status).toBe("IDLE");
    expect(bookingService.getExecutionCount()).toBe(0);
  });

  it("ignores a model product mention copied from prior state during a price objection", async () => {
    const extractor: IntentExtractor = {
      extract: async (message) => message.includes("expensive")
        ? { productMention: "MESH_WIFI6", planCode: "PRO", requirementCount: 5, priceObjection: true, confirmBooking: false, cancel: false }
        : { productMention: "AeroMesh", planCode: "PRO", requirementCount: 5, priceObjection: false, confirmBooking: false, cancel: false },
    };
    const guarded = new SalesAgent(new SessionManager(), extractor, bookingService);
    const session = guarded.createSession();
    await guarded.handleMessage(session.sessionId, "one", "AeroMesh PRO for five rooms");
    const objection = await guarded.handleMessage(session.sessionId, "two", "That is too expensive");
    expect(objection.state.selection.skuId).toBe("SKU_MESH_WIFI6");
    expect(objection.state.quote?.promoCode).toBe("SAVE10");
  });

  it("uses an explicit room count when the model repeats a stale count", async () => {
    const extractor: IntentExtractor = {
      extract: async (message) => ({
        productMention: message.includes("AeroMesh") ? "AeroMesh" : null,
        planCode: "PRO",
        requirementCount: 5,
        priceObjection: false,
        confirmBooking: message.includes("book it"),
        cancel: false,
      }),
    };
    const guarded = new SalesAgent(new SessionManager(), extractor, bookingService);
    const session = guarded.createSession();
    await guarded.handleMessage(session.sessionId, "one", "AeroMesh PRO for five rooms");
    const changed = await guarded.handleMessage(session.sessionId, "two", "Switch to seven rooms and book it");
    expect(changed.state.selection.quantity).toBe(4);
    expect(changed.state.stage).toBe("AWAITING_CONFIRMATION");
    expect(bookingService.getExecutionCount()).toBe(0);
  });

  it("does not treat a hypothetical booking question as confirmation", async () => {
    const session = agent.createSession();
    await agent.handleMessage(session.sessionId, "one", "AeroMesh PRO for five rooms");
    const reply = await agent.handleMessage(session.sessionId, "two", "Maybe book it later?");
    expect(reply.state.stage).toBe("AWAITING_CONFIRMATION");
    expect(bookingService.getExecutionCount()).toBe(0);
  });

  it("does not book when asked to confirm the price", async () => {
    const session = agent.createSession();
    await agent.handleMessage(session.sessionId, "one", "AeroMesh PRO for five rooms");
    const reply = await agent.handleMessage(session.sessionId, "two", "Can you confirm the price?");
    expect(reply.state.stage).toBe("AWAITING_CONFIRMATION");
    expect(bookingService.getExecutionCount()).toBe(0);
  });

  it("does not let an in-flight booking race with a later change", async () => {
    const slowBookings = new BookingService(30);
    const guarded = new SalesAgent(new SessionManager(), new DeterministicIntentExtractor(), slowBookings);
    const session = guarded.createSession();
    await guarded.handleMessage(session.sessionId, "one", "AeroMesh PRO for five rooms");
    const booking = guarded.handleMessage(session.sessionId, "confirm", "Yes, book it");
    const change = guarded.handleMessage(session.sessionId, "change", "Switch to seven rooms");
    const [booked, later] = await Promise.all([booking, change]);
    expect(booked.state.stage).toBe("BOOKED");
    expect(later.state.booking.record?.booking_id).toBe(booked.state.booking.record?.booking_id);
    expect(later.state.selection.quantity).toBe(3);
    expect(slowBookings.getExecutionCount()).toBe(1);
  });
});
