import type { SessionState, ToolEvent } from "../types";

interface InspectorProps {
  session: SessionState | null;
  tools: ToolEvent[];
}

function ToolCard({ tool }: { tool: ToolEvent }) {
  return (
    <article className="tool-card">
      <div className="tool-card-heading">
        <h3>{tool.toolName}</h3>
        <span className={`tool-status status-${tool.status.toLowerCase()}`}>
          {tool.status}
        </span>
      </div>
      <p>
        {tool.durationMs} ms{tool.deduplicated ? " · deduplicated" : ""}
      </p>
      <pre>{JSON.stringify({ input: tool.input, output: tool.output }, null, 2)}</pre>
    </article>
  );
}

export function Inspector({ session, tools }: InspectorProps) {
  const inspectableState = session
    ? {
        sessionId: session.sessionId,
        stage: session.stage,
        selectionVersion: session.selectionVersion,
        discountTier: session.discountTier,
        selection: session.selection,
        quote: session.quote,
        booking: session.booking,
      }
    : null;

  return (
    <aside className="inspector" aria-label="Agent inspector">
      <section aria-labelledby="state-title">
        <div className="section-heading compact">
          <div>
            <p className="section-kicker">Authoritative data</p>
            <h2 id="state-title">Session state</h2>
          </div>
        </div>
        <pre tabIndex={0} className="state-output">
          {inspectableState ? JSON.stringify(inspectableState, null, 2) : "Starting session…"}
        </pre>
      </section>

      <section aria-labelledby="tools-title">
        <div className="section-heading compact">
          <div>
            <p className="section-kicker">Audit trail</p>
            <h2 id="tools-title">Tool calls</h2>
          </div>
          <span className="count-badge" aria-label={`${tools.length} tool calls`}>
            {tools.length}
          </span>
        </div>
        <div className="tool-output">
          {tools.length === 0 ? (
            <p className="muted">Exact tool payloads will appear here.</p>
          ) : (
            tools.map((tool) => <ToolCard key={tool.id} tool={tool} />)
          )}
        </div>
      </section>
    </aside>
  );
}
