import type { AddressInfo } from "node:net";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApplication } from "../server/app.js";
import type { AppConfig } from "../server/config.js";
import type { SessionState } from "../server/domain/types.js";
import {
  DeterministicIntentExtractor,
  IntentExtractionError,
  type IntentExtractor,
} from "../server/llm/intent-extractor.js";
import { BookingService } from "../server/services/booking-service.js";

const config: AppConfig = {
  port: 3000,
  bookingLatencyMs: 1,
  llmTimeoutMs: 1000,
  intentMode: "deterministic",
  geminiModel: "gemini-3.1-flash-lite",
  groqModel: "openai/gpt-oss-20b",
  allowDeterministicFallback: true,
};

describe("HTTP API", () => {
  it("serves the catalog and a complete chat response", async () => {
    const { app } = createApplication({
      config,
      intentExtractor: new DeterministicIntentExtractor(),
    });
    const catalog = await request(app).get("/api/catalog").expect(200);
    expect(catalog.body.SKU_MESH_WIFI6.max_capacity_per_unit).toBe(2);

    const session = await request(app).post("/api/sessions").expect(201);
    const turn = await request(app)
      .post(`/api/sessions/${session.body.sessionId}/messages`)
      .send({ requestId: "api-turn-1", message: "Arrow mesh PRO for 5 rooms" })
      .expect(200);
    expect(turn.body.state.selection.quantity).toBe(3);
    expect(turn.body.toolCalls[0].toolName).toBe("get_catalog_info");
  });

  it("makes the downstream booking endpoint idempotent", async () => {
    const bookingService = new BookingService(5);
    const { app } = createApplication({
      config,
      intentExtractor: new DeterministicIntentExtractor(),
      bookingService,
    });
    const payload = {
      sku_id: "SKU_MESH_WIFI6",
      plan_code: "PRO",
      quantity: 3,
      promo_code: "SAVE10",
      final_price: 1347.3,
    };
    const [first, second] = await Promise.all([
      request(app).post("/api/bookings").set("Idempotency-Key", "booking-key").send(payload),
      request(app).post("/api/bookings").set("Idempotency-Key", "booking-key").send(payload),
    ]);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.booking_id).toBe(first.body.booking_id);
    expect(bookingService.getExecutionCount()).toBe(1);
  });

  it("rejects invented promos, wrong totals, and key reuse with changed payload", async () => {
    const bookingService = new BookingService(1);
    const { app } = createApplication({ config, intentExtractor: new DeterministicIntentExtractor(), bookingService });
    const payload = {
      sku_id: "SKU_MESH_WIFI6",
      plan_code: "PRO",
      quantity: 3,
      promo_code: "SAVE10",
      final_price: 1347.3,
    };
    await request(app).post("/api/bookings").set("Idempotency-Key", "valid-key")
      .send({ ...payload, promo_code: "SAVE50" }).expect(400);
    await request(app).post("/api/bookings").set("Idempotency-Key", "valid-key")
      .send({ ...payload, final_price: 100 }).expect(400);
    await request(app).post("/api/bookings").set("Idempotency-Key", "valid-key")
      .send(payload).expect(201);
    await request(app).post("/api/bookings").set("Idempotency-Key", "valid-key")
      .send({ ...payload, quantity: 4, final_price: 1796.4 }).expect(400);
    expect(bookingService.getExecutionCount()).toBe(1);
  });

  it("fails closed without mutating state when intent extraction fails", async () => {
    const failingExtractor: IntentExtractor = {
      extract: async () => {
        throw new IntentExtractionError();
      },
    };
    const { app } = createApplication({ config, intentExtractor: failingExtractor });
    const created = await request(app).post("/api/sessions").expect(201);
    await request(app)
      .post(`/api/sessions/${created.body.sessionId}/messages`)
      .send({ requestId: "failed-turn", message: "Book something" })
      .expect(503);
    const state = await request(app)
      .get(`/api/sessions/${created.body.sessionId}`)
      .expect(200);
    expect((state.body as SessionState).turnCounter).toBe(0);
    expect((state.body as SessionState).catalogFetched).toBe(false);
  });

  it("commits one booking even if the confirmation HTTP response is interrupted", async () => {
    const bookingService = new BookingService(80);
    const { app, agent } = createApplication({
      config,
      intentExtractor: new DeterministicIntentExtractor(),
      bookingService,
    });
    const server = app.listen(0);
    try {
      const port = (server.address() as AddressInfo).port;
      const base = `http://127.0.0.1:${port}`;
      const session = agent.createSession();
      await agent.handleMessage(session.sessionId, "quote", "AeroMesh PRO for five rooms");
      const controller = new AbortController();
      const pending = fetch(`${base}/api/sessions/${session.sessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: "interrupted-confirm", message: "Yes, book it" }),
        signal: controller.signal,
      }).catch(() => undefined);

      for (let attempt = 0; attempt < 100 && agent.getSession(session.sessionId).stage !== "BOOKING"; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      expect(agent.getSession(session.sessionId).stage).toBe("BOOKING");
      controller.abort();
      await pending;
      for (let attempt = 0; attempt < 100 && agent.getSession(session.sessionId).stage !== "BOOKED"; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      const state = agent.getSession(session.sessionId);
      expect(state.stage).toBe("BOOKED");
      expect(state.toolEvents.filter((event) => event.toolName === "create_booking")).toHaveLength(1);
      expect(bookingService.getExecutionCount()).toBe(1);
    } finally {
      server.close();
    }
  });

});
