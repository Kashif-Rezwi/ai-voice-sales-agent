import { existsSync } from "node:fs";
import path from "node:path";
import express, { type ErrorRequestHandler } from "express";
import { z, ZodError } from "zod";
import { SalesAgent } from "./agent/sales-agent.js";
import { loadConfig, type AppConfig } from "./config.js";
import { getCatalogInfo } from "./domain/catalog.js";
import { IntentExtractionError, createIntentExtractor, type IntentExtractor } from "./llm/intent-extractor.js";
import {
  BookingService,
  BookingValidationError,
} from "./services/booking-service.js";
import {
  SessionManager,
  SessionNotFoundError,
} from "./services/session-manager.js";

const messageSchema = z.object({
  requestId: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(4000),
});

const bookingSchema = z.object({
  sku_id: z.enum(["SKU_AIRPODS_PRO2", "SKU_MESH_WIFI6", "SKU_TEAM_HUB"]),
  plan_code: z.enum(["STD", "CARE", "PRO"]),
  quantity: z.number().int().positive(),
  promo_code: z.enum(["SAVE10", "CLOSENOW15"]).nullable(),
  final_price: z.number().finite().nonnegative(),
});

export interface ApplicationOptions {
  config?: AppConfig;
  intentExtractor?: IntentExtractor;
  bookingService?: BookingService;
  sessionManager?: SessionManager;
}

export interface ApplicationBundle {
  app: express.Express;
  config: AppConfig;
  agent: SalesAgent;
  bookingService: BookingService;
  sessionManager: SessionManager;
}

export function createApplication(options: ApplicationOptions = {}): ApplicationBundle {
  const config = options.config ?? loadConfig();
  const sessionManager = options.sessionManager ?? new SessionManager();
  const bookingService =
    options.bookingService ?? new BookingService(config.bookingLatencyMs);
  const intentExtractor = options.intentExtractor ?? createIntentExtractor(config);
  const agent = new SalesAgent(sessionManager, intentExtractor, bookingService);
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      intentMode: config.intentMode,
      voiceMode: "browser-web-speech",
    });
  });

  app.get("/api/catalog", (_request, response) => {
    response.json(getCatalogInfo());
  });

  app.post("/api/sessions", (_request, response) => {
    response.status(201).json(agent.createSession());
  });

  app.get("/api/sessions/:sessionId", (request, response) => {
    response.json(agent.getSession(request.params.sessionId));
  });

  app.post("/api/sessions/:sessionId/messages", async (request, response) => {
    const input = messageSchema.parse(request.body);
    const result = await agent.handleMessage(
      request.params.sessionId,
      input.requestId,
      input.message,
    );
    response.json(result);
  });

  app.post("/api/bookings", async (request, response) => {
    const idempotencyHeader = request.header("Idempotency-Key");
    if (!idempotencyHeader) {
      throw new BookingValidationError("Idempotency-Key is required.");
    }
    const input = bookingSchema.parse(request.body);
    const result = await bookingService.createBooking(input, idempotencyHeader);
    response.status(result.deduplicated ? 200 : 201).json({
      ...result.record,
      deduplicated: result.deduplicated,
    });
  });

  const clientDirectory = path.resolve(process.cwd(), "dist", "client");
  const clientIndex = path.join(clientDirectory, "index.html");
  app.use(express.static(clientDirectory));
  app.get(/^(?!\/api(?:\/|$)|\/health$).*/, (_request, response, next) => {
    if (existsSync(clientIndex)) {
      response.sendFile(clientIndex);
      return;
    }
    next();
  });

  app.use((_request, response) => {
    response.status(404).json({ error: "Route not found." });
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof SessionNotFoundError) {
      response.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof IntentExtractionError) {
      response.status(503).json({
        error: "Intent extraction is unavailable. No conversation state was changed.",
      });
      return;
    }
    if (error instanceof BookingValidationError || error instanceof ZodError) {
      response.status(400).json({
        error: error instanceof ZodError ? "Invalid request payload." : error.message,
        ...(error instanceof ZodError ? { details: error.issues } : {}),
      });
      return;
    }
    if (error instanceof Error && /cannot be empty/i.test(error.message)) {
      response.status(400).json({ error: error.message });
      return;
    }
    console.error(error);
    response.status(500).json({ error: "Internal server error." });
  };
  app.use(errorHandler);

  return { app, config, agent, bookingService, sessionManager };
}
