# AI Voice Sales Agent Roadmap

This roadmap implements a deterministic sales engine with Gemini/Groq free-tier intent extraction and browser-native voice input/output. The model interprets language; TypeScript owns catalog matching, pricing, discounts, confirmation, booking, and idempotency.

## Non-negotiable invariants

- Only catalog allowlist matches can select a SKU.
- Quantity is always `Math.ceil(requirement / max_capacity_per_unit)`.
- Prices use integer cents and discount basis points.
- Every configuration starts with an eligible quote; a new SKU resets discount to standard pricing.
- Discounts advance only after objections: standard, `SAVE10`, then `CLOSENOW15`.
- Booking requires a current quote that was shown on an earlier turn and an explicit confirmation.
- Any SKU, plan, or requirement change invalidates the current confirmation.
- A session mutex, request deduplication, and booking idempotency key prevent duplicate charges.
- Typed and voice turns from React use the same `SalesAgent.handleMessage()` path.

## Phase 1: Bootstrap and contracts

- [x] Initialize Node.js 22+, strict TypeScript, Express, Zod, Vitest, and Supertest.
- [x] Define configuration, catalog, domain contracts, scripts, and environment examples.
- [x] Add the implementation roadmap and setup documentation.

## Phase 2: Catalog, matching, and pricing

- [x] Implement the fixed catalog and `get_catalog_info()`.
- [x] Add conservative alias matching for informal names and typos.
- [x] Reject ambiguous and out-of-catalog products.
- [x] Calculate exact quantities and totals in cents.
- [x] Render canonical USD quote text.

## Phase 3: State machine and negotiation

- [x] Serialize turns per session and deduplicate `requestId` values.
- [x] Track selection, quote, discount tier, turn/version counters, and booking status.
- [x] Enforce standard -> `SAVE10` -> `CLOSENOW15` with no skipping.
- [x] Preserve discount for plan/quantity changes and reset on SKU changes.
- [x] Requote and require later confirmation after every change.

## Phase 4: Idempotent booking

- [x] Implement `create_booking()` with configurable latency.
- [x] Revalidate every booking payload against catalog pricing.
- [x] Cache in-flight and completed requests by idempotency key.
- [x] Record exact tool inputs, outputs, timing, and deduplication status.

## Phase 5: LLM orchestration and APIs

- [x] Use free-tier Gemini `gemini-3.1-flash-lite` structured output by default.
- [x] Support Groq `openai/gpt-oss-20b` strict structured output as a free-tier alternative.
- [x] Keep booking tools inaccessible to the model.
- [x] Fail closed on model errors or malformed output.
- [x] Expose catalog, sessions, messages, booking, inspection, and health endpoints.

## Phase 6: React voice console

- [x] Add a Vite-powered React/TypeScript application for text and microphone turns.
- [x] Render authoritative session state and exact tool traces in focused React components.
- [x] Proxy API requests during development and serve the compiled SPA from Express in production.
- [x] Use browser-native speech recognition and synthesis for a zero-cost voice path.
- [x] Give each finalized browser transcript a stable generated request ID for server deduplication.
- [x] Cancel stale speech on interruption and speak only canonical backend replies.

## Phase 7: Verification and handoff

- [x] Cover fuzzy matching, quantity math, discount tiers, mutations, and unknown products.
- [x] Cover premature confirmation and concurrent/deduplicated bookings.
- [x] Cover API contracts and fail-closed intent extraction.
- [x] Document a repeatable evaluator walkthrough and production limitations.

## Production follow-ups

- Replace in-memory sessions with Redis or a transactional database.
- Use distributed locks and a durable idempotency table for multiple server instances.
- Add authentication, authorization, rate limiting, observability, and persistent audit logs.
- Add recorded-audio regression datasets for accents, noise, product terms, and currency values.
