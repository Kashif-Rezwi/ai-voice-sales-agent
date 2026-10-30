import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ConversationMessage, SessionStage } from "../types";

interface ConversationPanelProps {
  messages: ConversationMessage[];
  stage: SessionStage;
  sessionReady: boolean;
  isListening: boolean;
  voiceSupported: boolean;
  interimTranscript: string;
  onSend: (message: string) => void;
  onRetry: (requestId: string) => void;
  onStartListening: () => void;
  onStopListening: () => void;
}

const stageLabels: Record<SessionStage, string> = {
  COLLECTING: "Finding your fit",
  AWAITING_CONFIRMATION: "Quote ready",
  BOOKING: "Booking in progress",
  BOOKED: "Booked",
  BOOKING_FAILED: "Booking needs retry",
};

export function ConversationPanel(props: ConversationPanelProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (props.sessionReady) inputRef.current?.focus({ preventScroll: true });
  }, [props.sessionReady]);

  useEffect(() => {
    const history = historyRef.current;
    if (history) history.scrollTop = history.scrollHeight;
  }, [props.messages]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || !props.sessionReady) return;
    setDraft("");
    props.onSend(message);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
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
    <section className="conversation-panel" aria-label="Sales chat">
      <div className="chat-heading">
        <span className="chat-heading-title">Conversation</span>
        <span className={`stage stage-${props.stage.toLowerCase()}`} role="status">
          {stageLabels[props.stage]}
        </span>
      </div>

      <div ref={historyRef} className="conversation" role="log" aria-label="Conversation history" aria-live="polite">
        {props.messages.length === 0 ? (
          <div className="empty-state">
            <span className="welcome-mark" aria-hidden="true">S</span>
            <h2>What can I help you find?</h2>
            <p>Tell me the product, plan, and how many rooms or people you need. I’ll calculate the exact quote before you book.</p>
            <p className="example">Try: “Arrow mesh wifi PRO for five rooms”</p>
          </div>
        ) : (
          props.messages.map((message) => (
            <article key={message.id} className={`message-row ${message.role}`}>
              <span className="message-author">{message.role === "user" ? "You" : "Sales assistant"}</span>
              <div className={`message-bubble${message.status ? ` ${message.status}` : ""}`}>
                {message.status === "pending" ? (
                  <span className="typing" role="status">Working on your reply<span aria-hidden="true">…</span></span>
                ) : (
                  <span>{message.text}</span>
                )}
              </div>
              {message.status === "error" && (
                <button type="button" className="retry-button" onClick={() => props.onRetry(message.requestId)}>
                  Retry this message
                </button>
              )}
            </article>
          ))
        )}
      </div>

      <div className="composer-area">
        {props.isListening && (
          <p className="live-transcript" role="status">
            {props.interimTranscript || "Listening…"}
          </p>
        )}
        <form className="composer" onSubmit={submit}>
          <label className="sr-only" htmlFor="message-input">Message the sales assistant</label>
          <textarea
            ref={inputRef}
            id="message-input"
            name="message"
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={props.sessionReady ? "Message the sales assistant…" : "Connecting to chat…"}
            disabled={!props.sessionReady}
          />
          {props.voiceSupported && (
            <button
              type="button"
              className={`talk-button${props.isListening ? " listening" : ""}`}
              disabled={!props.sessionReady}
              aria-label={props.isListening ? "Release to send voice message" : "Hold to talk"}
              aria-pressed={props.isListening}
              title="Hold to talk"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                props.onStartListening();
              }}
              onPointerUp={props.onStopListening}
              onPointerCancel={props.onStopListening}
              onKeyDown={handleTalkKeyDown}
              onKeyUp={handleTalkKeyUp}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8" />
              </svg>
            </button>
          )}
          <button type="submit" className="send-button" disabled={!props.sessionReady || !draft.trim()}>
            Send
          </button>
        </form>
        <p className="composer-hint">
          Enter to send · Shift+Enter for a new line{props.voiceSupported ? " · Hold the mic to speak" : ""}
        </p>
      </div>
    </section>
  );
}
