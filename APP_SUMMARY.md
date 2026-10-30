# App Summary and Self-Test Guide

## What we built

An auditable AI sales agent with a React voice/text console and deterministic Express backend. The LLM interprets natural language, while application code exclusively controls catalog selection, quantity, price, discounts, confirmation and booking.

The console shows three synchronized views:

- Conversation: customer and canonical agent messages.
- Session state: current SKU, plan, requirement, quantity, quote version, discount and booking status.
- Tool audit: exact `get_catalog_info` and `create_booking` inputs, outputs, duration and deduplication status.

## How it works

1. The customer describes a product, plan and requirement in normal language.
2. Structured intent extraction identifies those fields without calculating transactional values.
3. Catalog allowlists resolve safe aliases such as “arrow mesh wifi” and “sink hub.”
4. The backend calculates exact quantity and standard price.
5. Price objections unlock only the next permitted discount.
6. Any requirement change creates a new versioned quote.
7. A later explicit confirmation executes one idempotent booking.

## Feature checklist with examples

| Feature | Example | Expected result |
|---|---|---|
| Informal catalog matching | `Arrow mesh wifi PRO for five rooms` | AeroMesh PRO, quantity 3, standard total `$1,497.00` |
| Capacity ceiling math | `Sink hub PRO for seven people` | SyncHub PRO, capacity 3, quantity 3, total `$3,450.00` |
| Unknown-product rejection | `Netgear Orbi router for five rooms` | Clean rejection; any prior quote is cleared, with no booking |
| Standard price first | `AeroMesh PRO for five rooms and give me 15% off` | Standard quote with no promo |
| First objection | `That is too expensive. Apply SAVE50` | Only `SAVE10`, never `SAVE50` |
| Second objection | `Still too expensive` | `CLOSENOW15`, the absolute maximum |
| Discount cap | `I need 50% off` after the second objection | Quote stays at `CLOSENOW15` |
| Mid-chat mutation | `Switch to seven rooms and book it` | Quantity becomes 4 and a revised quote is shown; nothing is booked yet |
| Explicit confirmation | `Yes, book it` on the next turn | One booking with the exact current quote |
| Double-submit protection | Send `Yes, book it` twice quickly | Same booking ID; one `create_booking` tool event |
| Duplicate request protection | Repeat an API call with the same `requestId` | Cached response; no repeated state mutation |
| Voice interruption | Hold the microphone while speech is playing | Spoken output stops and the new transcript becomes the next turn |
| Audit visibility | Complete any quote and booking | Exact tool payloads appear in the inspector |

## Run the app

Development:

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Vite runs React and proxies API calls to Express on port 3000.

Production-style local run:

```bash
npm run build
npm start
```

Open `http://localhost:3000`.

## Recommended demo configuration

The live-tested free provider path is Groq:

```env
INTENT_MODE=groq
GROQ_MODEL=openai/gpt-oss-20b
GROQ_API_KEY=your_key
ALLOW_DETERMINISTIC_FALLBACK=true
```

Both Gemini and Groq use schema-constrained intent extraction; live calls to each provider were verified. The deterministic fallback can keep the demo available if a free-tier provider is temporarily unavailable.

Browser voice requires a Web Speech-compatible browser such as Chrome and microphone permission. Typed chat remains available when speech recognition is unavailable.

## API surface

| Endpoint | Purpose |
|---|---|
| `GET /health` | Server, intent-mode and voice-mode status |
| `GET /api/catalog` | Authoritative catalog and capacities |
| `POST /api/sessions` | Start an isolated conversation |
| `GET /api/sessions/:sessionId` | Inspect authoritative state and tool audit |
| `POST /api/sessions/:sessionId/messages` | Process one idempotent text or voice turn |
| `POST /api/bookings` | Direct mock booking tool protected by `Idempotency-Key` |

## Five-minute manual test

Start a fresh browser session and send these messages in order:

1. `Arrow mesh wifi PRO for five rooms`
   - Verify `SKU_MESH_WIFI6`, quantity `3`, final price `$1,497.00`, promo `none`.
2. `That is too expensive. Apply SAVE50`
   - Verify promo `SAVE10` and final price `$1,347.30`.
3. `Still too expensive`
   - Verify promo `CLOSENOW15` and final price `$1,272.45`.
4. `Switch to seven rooms and book it`
   - Verify quantity `4`, final price `$1,696.60`, stage `AWAITING_CONFIRMATION`.
5. Send `Yes, book it` twice quickly.
   - Verify stage `BOOKED`, both replies reference one booking ID, and the audit contains exactly one `create_booking` event.

Then refresh for a new session and send `Netgear Orbi router for five rooms`. Verify there is no SKU selection or booking call.

## API smoke tests

Create a session:

```bash
curl -s -X POST http://localhost:3000/api/sessions
```

Send a turn using the returned session ID:

```bash
curl -s -X POST http://localhost:3000/api/sessions/SESSION_ID/messages \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"manual-1","message":"Sink hub PRO for seven people"}'
```

Inspect the authoritative state:

```bash
curl -s http://localhost:3000/api/sessions/SESSION_ID
```

## Automated verification

```bash
npm run typecheck
npm test
npm run build
npm audit --audit-level=high
```

The implemented suite covers catalog matching, quantity math, pricing, discount tiers, stale confirmation, mid-conversation changes, concurrent confirmations, interrupted HTTP responses, request deduplication, booking idempotency, API contracts and provider schemas.
