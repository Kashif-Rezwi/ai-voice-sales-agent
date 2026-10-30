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

/** Naive JSON syntax highlighter — returns HTML string */
function syntaxHighlight(json: string): string {
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = "json-number";
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "json-key" : "json-string";
      } else if (/true|false/.test(match)) {
        cls = "json-boolean";
      } else if (/null/.test(match)) {
        cls = "json-null";
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

function ToolCard({ tool }: { tool: ToolEvent }) {
  const statusClass = tool.status === "SUCCEEDED" ? "succeeded" : "failed";
  const highlightedJson = syntaxHighlight(JSON.stringify({ input: tool.input, output: tool.output }, null, 2));

  return (
    <details className="tool-card">
      <summary>
        <span className={`tool-status-dot ${statusClass}`} aria-hidden="true" />
        <span className="tool-name">{tool.toolName}</span>
        <span className={`tool-status-label ${statusClass}`} aria-label={`Status: ${tool.status.toLowerCase()}`}>
          {tool.status === "SUCCEEDED" ? "OK" : "ERR"}
        </span>
        <span className="tool-meta">
          {tool.durationMs} ms{tool.deduplicated ? " · reused" : ""}
        </span>
      </summary>
      <div className="tool-payload">
        <strong>Payload &amp; result</strong>
        {/* eslint-disable-next-line react/no-danger */}
        <pre dangerouslySetInnerHTML={{ __html: highlightedJson }} />
      </div>
    </details>
  );
}

function BookingStatusBadge({ status }: { status: string | undefined }) {
  if (!status || status === "NONE") {
    return <span className="booking-status-badge none">No booking yet</span>;
  }
  if (status === "SUCCEEDED") {
    return <span className="booking-status-badge succeeded">✓ Confirmed</span>;
  }
  if (status === "IN_FLIGHT") {
    return <span className="booking-status-badge inflight">In progress…</span>;
  }
  if (status === "FAILED") {
    return <span className="booking-status-badge failed">Needs retry</span>;
  }
  return <span className="booking-status-badge none">{status}</span>;
}

function ProductIcon() {
  return (
    <div className="quote-product-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
    </div>
  );
}

export function Inspector({ session, tools, onClose }: InspectorProps) {
  const quote = session?.quote;
  const booking = session?.booking;

  return (
    <div className="details-content">
      <div className="details-header">
        <div className="details-header-left">
          <p className="details-eyebrow">Session</p>
          <h2>Details</h2>
        </div>
        <button type="button" className="close-button" onClick={onClose} aria-label="Close details">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" width="14" height="14">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="details-body">
        {/* Quote section */}
        <section className="details-section" aria-labelledby="quote-title">
          <h3 id="quote-title">Current quote</h3>
          {quote ? (
            <div className="quote-summary">
              <div className="quote-product-row">
                <ProductIcon />
                <strong className="quote-product">{quote.packageName}</strong>
              </div>
              <dl>
                <div><dt>Plan</dt><dd>{quote.planCode}</dd></div>
                <div><dt>Requirement</dt><dd>{quote.requirementCount}</dd></div>
                <div><dt>Units</dt><dd>{quote.quantity}</dd></div>
                <div><dt>Discount</dt><dd>{quote.discountPercent}%{quote.promoCode ? ` · ${quote.promoCode}` : ""}</dd></div>
                <div className="quote-total">
                  <dt>Total</dt>
                  <dd>{money(quote.finalPriceCents)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <p className="details-empty">Ask for a catalog package to see a quote here.</p>
          )}
        </section>

        {/* Booking section */}
        <section className="details-section" aria-labelledby="booking-title">
          <h3 id="booking-title">Booking</h3>
          <BookingStatusBadge status={booking?.status} />
          {booking?.record && (
            <div>
              <span className="booking-id-badge" aria-label={`Booking ID: ${booking.record.booking_id}`}>
                {booking.record.booking_id}
              </span>
            </div>
          )}
        </section>

        {/* Tool calls section */}
        <section className="details-section" aria-labelledby="tools-title">
          <h3 id="tools-title">
            API calls
            <span className="tool-count">{tools.length}</span>
          </h3>
          {tools.length ? (
            <div className="tool-list">
              {tools.map((tool) => <ToolCard key={tool.id} tool={tool} />)}
            </div>
          ) : (
            <p className="details-empty">Catalog and booking calls will appear as you chat.</p>
          )}
        </section>

        {/* Raw session state */}
        {session && (
          <details className="raw-state">
            <summary>Full session state</summary>
            {/* eslint-disable-next-line react/no-danger */}
            <pre dangerouslySetInnerHTML={{
              __html: syntaxHighlight(JSON.stringify({
                sessionId: session.sessionId,
                stage: session.stage,
                selectionVersion: session.selectionVersion,
                discountTier: session.discountTier,
                selection: session.selection,
                quote: session.quote,
                booking: session.booking,
              }, null, 2))
            }} />
          </details>
        )}
      </div>
    </div>
  );
}
