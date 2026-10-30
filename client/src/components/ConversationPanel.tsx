import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ConversationMessage, SessionStage } from "../types";

interface ConversationPanelProps {
  messages: ConversationMessage[];
  stage: SessionStage;
  sessionReady: boolean;
  pendingTurns: number;
  isListening: boolean;
  voiceSupported: boolean;
  interimTranscript: string;
  onSend: (message: string) => void;
  onStartListening: () => void;
  onStopListening: () => void;
}

export function ConversationPanel(props: ConversationPanelProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (props.sessionReady) inputRef.current?.focus({ preventScroll: true });
  }, [props.sessionReady]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [props.messages]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || !props.sessionReady) return;
    setDraft("");
    props.onSend(message);
  }

  function handleTalkKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) {
      event.preventDefault();
      props.onStartListening();
    }
  }

  function handleTalkKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      props.onStopListening();
    }
  }

  return (
    <section className="conversation-panel" aria-labelledby="conversation-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Conversation</p>
          <h2 id="conversation-title">Build an exact quote</h2>
        </div>
        <span className={`badge badge-${props.stage.toLowerCase()}`}>{props.stage}</span>
      </div>

      <div className="conversation" aria-live="polite" aria-label="Conversation history">
        {props.messages.length === 0 ? (
          <div className="empty-state">
            <span className="empty-mark" aria-hidden="true">↗</span>
            <p>Try “Arrow mesh Wi-Fi PRO for five rooms.”</p>
            <small>Every price and booking is verified by deterministic server rules.</small>
          </div>
        ) : (
          props.messages.map((message) => (
            <article key={message.id} className={`message ${message.role}`}>
              <span className="role">{message.role === "user" ? "You" : "Sales agent"}</span>
              <span>{message.text}</span>
            </article>
          ))
        )}
        <div ref={endRef} />
      </div>

      <p className="live-transcript" aria-live="polite">
        {props.interimTranscript ? `Hearing: ${props.interimTranscript}` : ""}
      </p>

      <form className="composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="message-input">Message the sales agent</label>
        <input
          ref={inputRef}
          id="message-input"
          name="message"
          type="text"
          autoComplete="off"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about a package, plan, or price…"
          disabled={!props.sessionReady}
          required
        />
        <button
          type="submit"
          className="send-button"
          disabled={!props.sessionReady || !draft.trim()}
        >
          Send
        </button>
        <button
          type="button"
          className={`talk-button${props.isListening ? " listening" : ""}`}
          disabled={!props.sessionReady || !props.voiceSupported}
          aria-describedby="voice-help"
          aria-pressed={props.isListening}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            props.onStartListening();
          }}
          onPointerUp={props.onStopListening}
          onPointerCancel={props.onStopListening}
          onKeyDown={handleTalkKeyDown}
          onKeyUp={handleTalkKeyUp}
        >
          {props.voiceSupported
            ? props.isListening
              ? "Release to send"
              : "Hold to talk"
            : "Voice unavailable"}
        </button>
      </form>
      <div className="composer-meta">
        <p id="voice-help">
          Free browser speech recognition. Spoken output is AI-generated.
        </p>
        {props.pendingTurns > 0 && (
          <p className="pending" role="status">
            Processing {props.pendingTurns} {props.pendingTurns === 1 ? "turn" : "turns"}…
          </p>
        )}
      </div>
    </section>
  );
}
