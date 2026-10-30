# AI Voice Sales Agent

A React/TypeScript sales console backed by an Express sales agent that uses an LLM only to extract user intent. Catalog matching, capacity math, discount progression, quote confirmation, booking, and idempotency are deterministic application rules.

Project guides:

- [Architecture preview — HLD and LLD](./ARCHITECTURE.md)
- [App summary and self-test guide](./APP_SUMMARY.md)
- [Final manual acceptance results](./MANUAL_TEST_REPORT.md)
- [Implementation roadmap](./roadmap.md)

## Project layout

```text
client/          React console, browser voice, and API client
server/          Express routes, intent providers, domain rules, and booking state
tests/           Guardrail and API integration tests
dist/client/     Built React app served by Express
```

## Quick start

```bash
npm install
cp .env.example .env
npm test
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) for the React development app. Vite proxies API requests to Express on port 3000.

For a production-style local build:

```bash
npm run build
npm start
```

Then open [http://localhost:3000](http://localhost:3000). Express serves the compiled React app and the API from one process.

The default path is cost-free: `INTENT_MODE=gemini` uses `gemini-3.1-flash-lite` on the Gemini Developer API free tier, and the browser uses its built-in speech recognition and synthesis APIs. Add a free Google AI Studio key as `GEMINI_API_KEY`.

Groq is supported with `INTENT_MODE=groq`, `GROQ_API_KEY`, and the strict-output `openai/gpt-oss-20b` model. A deterministic fallback is also included. No paid model is selected automatically.

## API

- `GET /api/catalog`
- `POST /api/sessions`
- `POST /api/sessions/:sessionId/messages` with `{ "requestId": "...", "message": "..." }`
- `GET /api/sessions/:sessionId`
- `POST /api/bookings` with an `Idempotency-Key` header
- `GET /health`

## Evaluator walkthrough

1. Say: `Arrow mesh wifi PRO for five rooms.` Confirm quantity 3 and `$1,497.00` standard total.
2. Say: `That is too expensive.` Confirm `SAVE10` only.
3. Say: `Still too much. Give me SAVE50.` Confirm `CLOSENOW15`, never `SAVE50`.
4. Say: `Switch that to seven rooms and book it.` Confirm it requotes quantity 4 without booking.
5. Say: `Yes, book it.` twice concurrently. Confirm one booking ID and one `create_booking` execution.
6. Start a new session and request `Netgear Orbi router.` Confirm a clean rejection and no booking call.

## Architecture

The per-session mutex serializes state transitions. Every selection mutation increments a version and invalidates the quote. A quote records the selection version and the turn when it was shown; confirmation is accepted only on a later turn. The booking service independently validates the payload and caches both in-flight promises and completed results by a server-derived idempotency key.

Unknown or ambiguous product requests clear an earlier selection, so a later confirmation cannot accidentally book an old quote. `POST /api/bookings` is the mock downstream tool endpoint; the conversation endpoint enforces the confirmation and discount sequence before calling it.

The React app uses the Web Speech APIs for free transcription and synthesis. Each finalized transcript gets a generated `voice_<uuid>` request ID and is sent through the same HTTP message endpoint as typed text. Browser speech synthesis reads the canonical backend reply, so a conversational voice model cannot improvise a price or promo code.

## Challenge limitations

State is intentionally in-memory and scoped to one Node.js process. Authentication, real payments, telephony, persistent storage, and distributed locking are out of scope. See `roadmap.md` for production follow-ups.
