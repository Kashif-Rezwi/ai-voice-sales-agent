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
  BOOKED: "✓ Booked",
  BOOKING_FAILED: "Booking needs retry",
};

// Catalog products for empty state cards
const PRODUCTS = [
  {
    name: "AirPods Pro 2nd Gen",
    price: "from $249",
    hint: "STD / CARE plans · 1 person",
    query: "AirPods Pro 2nd Gen CARE plan",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 18V7l12-2v11" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    ),
  },
  {
    name: "AeroMesh Wi-Fi 6E Home Pack",
    price: "from $399",
    hint: "STD / PRO plans · 2 rooms each",
    query: "AeroMesh Wi-Fi PRO for 5 rooms",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 8.5a12.5 12.5 0 0 1 20 0" opacity="0.5" />
        <path d="M5 11.5a8.5 8.5 0 0 1 14 0" opacity="0.75" />
        <path d="M8.5 14.5a4.5 4.5 0 0 1 7 0" />
        <circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    name: "SyncHub Conference Bar",
    price: "from $899",
    hint: "STD / PRO plans · 3 people each",
    query: "SyncHub Conference Bar PRO for 8 people",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M8 7V5a4 4 0 0 1 8 0v2" />
        <path d="M12 12v3m-3 0h6" />
      </svg>
    ),
  },
];

const PROMPT_CHIPS = [
  { label: "AeroMesh Wi-Fi PRO for 5 rooms", query: "AeroMesh Wi-Fi PRO for 5 rooms" },
  { label: "SyncHub Conference Bar PRO for 8 people", query: "SyncHub Conference Bar PRO for 8 people" },
  { label: "AirPods Pro 2nd Gen CARE plan", query: "AirPods Pro 2nd Gen CARE plan" },
];

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

  function fillQuery(query: string) {
    setDraft(query);
    inputRef.current?.focus({ preventScroll: true });
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
      {/* Stage badge heading */}
      <div className="chat-heading">
        <span className="chat-heading-title">Conversation</span>
        <span className={`stage stage-${props.stage.toLowerCase()}`} role="status">
          {stageLabels[props.stage]}
        </span>
      </div>

      {/* Message history */}
      <div ref={historyRef} className="conversation" role="log" aria-label="Conversation history" aria-live="polite">
        {props.messages.length === 0 ? (
          <div className="empty-state">
            {/* Animated orb */}
            <div className="welcome-orb" aria-hidden="true">
              <div className="welcome-orb-ring-2" />
              <div className="welcome-orb-ring" />
              <div className="welcome-orb-inner">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 10a10.06 10.06 0 0 1 20 0" opacity="0.5" />
                  <path d="M5 12.5a7 7 0 0 1 14 0" opacity="0.75" />
                  <path d="M8.5 15a3.5 3.5 0 0 1 7 0" />
                  <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />
                </svg>
              </div>
            </div>

            <h2>What can I help you find?</h2>
            <p>Tell me the product, plan, and how many rooms or people you need. I'll calculate the exact quote before you book.</p>

            {/* Product cards */}
            <div className="product-cards" role="list">
              {PRODUCTS.map((product) => (
                <button
                  key={product.name}
                  type="button"
                  className="product-card"
                  role="listitem"
                  disabled={!props.sessionReady}
                  aria-label={`Ask about ${product.name}`}
                  onClick={() => fillQuery(product.query)}
                >
                  <div className="product-card-icon" aria-hidden="true">
                    {product.icon}
                  </div>
                  <span className="product-card-name">{product.name}</span>
                  <span className="product-card-price">{product.price}</span>
                  <span className="product-card-hint">{product.hint}</span>
                </button>
              ))}
            </div>

            {/* Prompt chips */}
            <div className="prompt-chips" role="list" aria-label="Suggested queries">
              {PROMPT_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  className="prompt-chip"
                  role="listitem"
                  disabled={!props.sessionReady}
                  aria-label={`Try: ${chip.label}`}
                  onClick={() => fillQuery(chip.query)}
                >
                  {/* Sparkle icon */}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3l1.88 5.76a1 1 0 0 0 .94.69H21l-4.87 3.54a1 1 0 0 0-.36 1.12L17.65 20 12 16.27 6.35 20l1.88-5.89a1 1 0 0 0-.36-1.12L3 9.45h6.18a1 1 0 0 0 .94-.69L12 3Z" />
                  </svg>
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          props.messages.map((message) => (
            <article key={message.id} className={`message-row ${message.role}`}>
              <div className="message-meta">
                {message.role === "agent" && (
                  <span className="message-avatar" aria-hidden="true">AI</span>
                )}
                <span className="message-author">
                  {message.role === "user" ? "You" : "VoiceIQ"}
                </span>
              </div>
              <div className={`message-bubble${message.status ? ` ${message.status}` : ""}`}>
                {message.status === "pending" ? (
                  <div className="typing-dots" role="status" aria-label="Working on your reply">
                    <span aria-hidden="true" />
                    <span aria-hidden="true" />
                    <span aria-hidden="true" />
                  </div>
                ) : (
                  <span>{message.text}</span>
                )}
              </div>
              {message.status === "error" && (
                <button
                  type="button"
                  className="retry-button"
                  onClick={() => props.onRetry(message.requestId)}
                >
                  Retry this message
                </button>
              )}
            </article>
          ))
        )}
      </div>

      {/* Composer */}
      <div className="composer-area">
        {/* Live voice transcript bar */}
        {props.isListening && (
          <div className="live-transcript-bar" role="status">
            <div className="live-transcript-bar-dot" aria-hidden="true" />
            <p>{props.interimTranscript || "Listening…"}</p>
            <div className="waveform" aria-hidden="true">
              <div className="waveform-bar" />
              <div className="waveform-bar" />
              <div className="waveform-bar" />
              <div className="waveform-bar" />
              <div className="waveform-bar" />
              <div className="waveform-bar" />
            </div>
          </div>
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
            <div className={`talk-button-wrapper${props.isListening ? " listening" : ""}`}>
              <div className="talk-pulse" aria-hidden="true" />
              <div className="talk-pulse-2" aria-hidden="true" />
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
            </div>
          )}

          <button
            type="submit"
            className="send-button"
            disabled={!props.sessionReady || !draft.trim()}
          >
            {/* Send arrow icon */}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="1rem" height="1rem" style={{ marginRight: "0.3rem" }}>
              <path d="M22 2 11 13M22 2 15 22 11 13 2 9l20-7Z" />
            </svg>
            Send
          </button>
        </form>

        <div className="composer-footer">
          <p className="composer-hint">
            Enter to send · Shift+Enter for a new line{props.voiceSupported ? " · Hold mic to speak" : ""}
          </p>
          {/* Powered by Gemini */}
          <span className="powered-by" aria-label="Powered by Gemini">
            Powered by
            {/* Google G logo SVG */}
            <svg viewBox="0 0 24 24" aria-hidden="true" role="img">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Gemini
          </span>
        </div>
      </div>
    </section>
  );
}
