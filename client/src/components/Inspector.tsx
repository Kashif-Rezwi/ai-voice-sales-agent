import type { SessionState, ToolEvent } from "../types";

interface InspectorProps {
  session: SessionState | null;
  tools: ToolEvent[];
  onClose: () => void;
}

const money = (cents: number) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
}).format(cents / 100);

function ToolCard({ tool }: { tool: ToolEvent }) {
  return (
    <details className="tool-card">
      <summary>
        <span className="tool-name">{tool.toolName}</span>
        <span className="tool-meta">{tool.status.toLowerCase()} · {tool.durationMs} ms{tool.deduplicated ? " · reused" : ""}</span>
      </summary>
      <div className="tool-payload">
        <strong>Exact payload and result</strong>
        <pre>{JSON.stringify({ input: tool.input, output: tool.output }, null, 2)}</pre>
      </div>
    </details>
  );
}

export function Inspector({ session, tools, onClose }: InspectorProps) {
  const quote = session?.quote;
  const booking = session?.booking;

  return (
    <div className="details-content">
      <div className="details-header">
        <div>
          <p className="details-eyebrow">Conversation</p>
          <h2>Details</h2>
        </div>
        <button type="button" className="close-button" onClick={onClose} aria-label="Close details">×</button>
      </div>

      <div className="details-body">
        <section className="details-section" aria-labelledby="quote-title">
          <h3 id="quote-title">Current quote</h3>
          {quote ? (
            <div className="quote-summary">
              <strong className="quote-product">{quote.packageName}</strong>
              <dl>
                <div><dt>Plan</dt><dd>{quote.planCode}</dd></div>
                <div><dt>Requirement</dt><dd>{quote.requirementCount}</dd></div>
                <div><dt>Units</dt><dd>{quote.quantity}</dd></div>
                <div><dt>Discount</dt><dd>{quote.discountPercent}%{quote.promoCode ? ` · ${quote.promoCode}` : ""}</dd></div>
                <div className="quote-total"><dt>Total</dt><dd>{money(quote.finalPriceCents)}</dd></div>
              </dl>
            </div>
          ) : (
            <p className="details-empty">Ask for a catalog package to see a quote here.</p>
          )}
        </section>

        <section className="details-section" aria-labelledby="booking-title">
          <h3 id="booking-title">Booking</h3>
          <p className="booking-status">{booking?.status === "SUCCEEDED" ? "Confirmed" : booking?.status === "IN_FLIGHT" ? "In progress" : booking?.status === "FAILED" ? "Needs retry" : "No booking yet"}</p>
          {booking?.record && <p className="booking-id">ID: {booking.record.booking_id}</p>}
        </section>

        <section className="details-section" aria-labelledby="tools-title">
          <h3 id="tools-title">API calls <span className="tool-count">{tools.length}</span></h3>
          {tools.length ? (
            <div className="tool-list">{tools.map((tool) => <ToolCard key={tool.id} tool={tool} />)}</div>
          ) : (
            <p className="details-empty">Catalog and booking calls will appear as you chat.</p>
          )}
        </section>

        {session && (
          <details className="raw-state">
            <summary>Full session state</summary>
            <pre>{JSON.stringify({
              sessionId: session.sessionId,
              stage: session.stage,
              selectionVersion: session.selectionVersion,
              discountTier: session.discountTier,
              selection: session.selection,
              quote: session.quote,
              booking: session.booking,
            }, null, 2)}</pre>
          </details>
        )}
      </div>
    </div>
  );
}
