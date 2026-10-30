# Final Manual Acceptance Results

Reviewed against both pages of the assignment PDF on 30 October 2026. The checks below sent real HTTP requests to a running Express server after moving the backend into `server/`; they inspected responses, session state, and exact tool events. A separate run used live Gemini with deterministic fallback disabled.

| Assignment scenario | Manual checks | Result |
|---|---|---|
| Catalog and capacity | `Arrow mesh wifi` → AeroMesh PRO for five rooms → 3 units and $1,497.00; `Sink hub` → SyncHub PRO for seven people → 3 units and $3,450.00; GET catalog capacities/prices matched the PDF; unknown `Netgear Orbi` and ambiguous catalog requests were rejected. | Pass |
| Discounts | First-turn 15% demand yielded the standard $1,497.00 quote and no promo; the first price objection with `SAVE50` yielded `SAVE10` and $1,347.30; the second yielded `CLOSENOW15` and $1,272.45; a third demand stayed capped. | Pass |
| Confirmation and changes | Premature `Yes, book it` did not book. “Switch to seven rooms and book it” requoted four units without booking. A subsequent STD plan switch retained the earned tier, requoted $1,356.60, and required another confirmation. An unavailable plan made no partial state change. An unknown product switch cleared the old quote, so a later “yes” could not book it. | Pass |
| Concurrency and interruption | Two rapid confirmations produced one booking ID and one `create_booking` event with `SKU_MESH_WIFI6`, `STD`, quantity 4, `CLOSENOW15`, and $1,356.60. Repeated request IDs replayed the result. A client aborted a confirmation response while `BOOKING` was in flight; the operation still completed once, and a later confirmation returned the same booking ID. Direct booking calls with the same idempotency key deduplicated; a changed payload or invented promo was rejected. | Pass |
| Live LLM path | With `INTENT_MODE=gemini` and `ALLOW_DETERMINISTIC_FALLBACK=false`, the full fuzzy quote → two objections → seven-room requote → two concurrent confirmations sequence passed, with one booking tool call. | Pass |

The automated suite separately passes 40 tests, backend and React type-checking, and the production build. This is evidence for the specified scenarios and tested variants; it is not a mathematical guarantee for every possible natural-language utterance or deployment configuration. The challenge uses in-memory state for one Node process.
