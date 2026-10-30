# AI Voice Sales Agent

A sales chat app with a React interface and an Express server. You can type or speak a request, get a quote, negotiate within fixed rules, and confirm a mock booking. Gemini or Groq helps understand the wording; the server decides the product, quantity, price, discount, and booking.

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

The default model setting is `INTENT_MODE=gemini` with `gemini-3.1-flash-lite`. Put a Google AI Studio key in `GEMINI_API_KEY` in `.env` to use it. Without a key, the app uses its basic deterministic intent parser when `ALLOW_DETERMINISTIC_FALLBACK=true` (the default). The browser uses its built-in speech recognition and speech synthesis APIs.

To use Groq instead, set `INTENT_MODE=groq` and `GROQ_API_KEY` in `.env`; the configured model is `openai/gpt-oss-20b`. To verify that a live model is actually working, set `ALLOW_DETERMINISTIC_FALLBACK=false`. Then a model error produces a safe error response instead of silently using the basic parser.

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

Think of the app as one conversation moving through five parts:

```text
You (type or speak)
    ↓
React chat screen
    ↓  sends your message
Express server
    ├─ Gemini/Groq (or the fallback parser): reads your intent
    └─ SalesAgent: checks the catalog, calculates quantity and price,
                   applies discount rules, and decides what happens next
         ├─ SessionManager: remembers the current quote and booking status
         └─ BookingService: creates one mock booking after confirmation
    ↓
React shows the reply, current state, and exact tool calls
```

For example, you say `Arrow mesh wifi PRO for five rooms`. The intent parser reads your request. The server matches AeroMesh, sees that each unit covers two rooms, calculates `Math.ceil(5 / 2) = 3`, and quotes **$1,497.00**. The parser never supplies that price. If you say `Too expensive`, the server offers `SAVE10`; another objection can unlock `CLOSENOW15`. If you change to seven rooms, the server makes a new quote for four units and waits for you to confirm that new price on a later message.

A **session** is the server's memory for one conversation. It stores the selected package, plan, room count, discount level, latest quote, and booking status. Messages for the same session are handled one at a time, so a change cannot race with a booking. Each request also has a unique `requestId`; retrying the same request returns its saved result.

After an explicit `Yes, book it`, the server checks that the quoted details are still current. `BookingService` checks the price again and uses a unique **idempotency key** for that quote. If two confirmations arrive quickly, they resolve to the same booking ID instead of creating two bookings. The React inspector shows the exact `get_catalog_info` and `create_booking` payloads so you can verify this yourself.

Voice follows the same path as typed chat: the browser turns speech into text, sends that text to the message API, and speaks only the server's reply. `POST /api/bookings` is the mock downstream booking endpoint for testing; the conversation route is what enforces the quote and confirmation rules.

For the detailed state machine and schema diagrams, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Challenge limitations

State is intentionally in-memory and scoped to one Node.js process. Authentication, real payments, telephony, persistent storage, and distributed locking are out of scope. See `roadmap.md` for production follow-ups.
