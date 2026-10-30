import { useCallback, useEffect, useRef, useState } from "react";
import { createSession, sendMessage } from "./api";
import { ConversationPanel } from "./components/ConversationPanel";
import { Inspector } from "./components/Inspector";
import { useVoiceInput } from "./hooks/useVoiceInput";
import type { ConversationMessage, SessionState } from "./types";

let initialSessionRequest: Promise<SessionState> | null = null;

function loadInitialSession(): Promise<SessionState> {
  initialSessionRequest ??= createSession().catch((error: unknown) => {
    initialSessionRequest = null;
    throw error;
  });
  return initialSessionRequest;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Something went wrong. Please try again.";
}

export function App() {
  const responseGeneration = useRef(0);
  const sessionGeneration = useRef(0);
  const latestTurnVersion = useRef(0);
  const detailsRef = useRef<HTMLDialogElement>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [pendingTurns, setPendingTurns] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const beginSession = useCallback((initial = false) => {
    const generation = ++sessionGeneration.current;
    ++responseGeneration.current;
    latestTurnVersion.current = 0;
    window.speechSynthesis?.cancel();
    setSession(null);
    setMessages([]);
    setPendingTurns(0);
    setError(null);
    setDetailsOpen(false);

    void (initial ? loadInitialSession() : createSession())
      .then((created) => {
        if (generation === sessionGeneration.current) setSession(created);
      })
      .catch((reason: unknown) => {
        if (generation === sessionGeneration.current) setError(errorMessage(reason));
      });
  }, []);

  useEffect(() => {
    beginSession(true);
    return () => { ++sessionGeneration.current; };
  }, [beginSession]);

  useEffect(() => {
    const dialog = detailsRef.current;
    if (!dialog) return;
    if (detailsOpen && !dialog.open) dialog.showModal();
    if (!detailsOpen && dialog.open) dialog.close();
  }, [detailsOpen]);

  const sendTurn = useCallback(
    (rawMessage: string, suppliedRequestId?: string, retry = false) => {
      const message = rawMessage.trim();
      const sessionId = session?.sessionId;
      if (!message || !sessionId) return;

      const requestId = suppliedRequestId ?? crypto.randomUUID();
      const generation = ++responseGeneration.current;
      const activeSession = sessionGeneration.current;
      window.speechSynthesis?.cancel();
      setError(null);

      if (retry) {
        setMessages((current) => current.map((item) =>
          item.id === `agent_${requestId}`
            ? { ...item, text: "", status: "pending" }
            : item,
        ));
      } else {
        setMessages((current) => [
          ...current,
          { id: `user_${requestId}`, requestId, role: "user", text: message },
          { id: `agent_${requestId}`, requestId, role: "agent", text: "", status: "pending" },
        ]);
      }
      setPendingTurns((count) => count + 1);

      void sendMessage(sessionId, requestId, message)
        .then((result) => {
          if (activeSession !== sessionGeneration.current) return;
          if (result.turnVersion >= latestTurnVersion.current) {
            latestTurnVersion.current = result.turnVersion;
            setSession(result.state);
          }
          setMessages((current) => current.map((item) =>
            item.id === `agent_${requestId}`
              ? { ...item, text: result.assistantMessage, status: undefined }
              : item,
          ));

          if (suppliedRequestId?.startsWith("voice_") && generation === responseGeneration.current) {
            const utterance = new SpeechSynthesisUtterance(result.assistantMessage);
            window.speechSynthesis?.speak(utterance);
          }
        })
        .catch((reason: unknown) => {
          if (activeSession !== sessionGeneration.current) return;
          setMessages((current) => current.map((item) =>
            item.id === `agent_${requestId}`
              ? { ...item, text: errorMessage(reason), status: "error" }
              : item,
          ));
        })
        .finally(() => {
          if (activeSession === sessionGeneration.current) {
            setPendingTurns((count) => Math.max(0, count - 1));
          }
        });
    },
    [session?.sessionId],
  );

  const retryTurn = useCallback((requestId: string) => {
    const original = messages.find((item) => item.id === `user_${requestId}`);
    if (original) sendTurn(original.text, requestId, true);
  }, [messages, sendTurn]);

  const voice = useVoiceInput(sendTurn, setError);
  const startListening = useCallback(() => {
    ++responseGeneration.current;
    voice.startListening();
  }, [voice]);

  const statusLabel = error && !session
    ? "Connection failed"
    : !session
      ? "Connecting"
      : pendingTurns > 0
        ? "Replying"
        : "Ready";

  const statusDotClass = error && !session
    ? "failed"
    : !session
      ? "connecting"
      : "";

  const shortSessionId = session?.sessionId
    ? session.sessionId.slice(-8).toUpperCase()
    : null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          {/* Brand mark with wifi/voice wave icon */}
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 10a10.06 10.06 0 0 1 20 0" opacity="0.4" />
              <path d="M5 12.5a7 7 0 0 1 14 0" opacity="0.65" />
              <path d="M8.5 15a3.5 3.5 0 0 1 7 0" />
              <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <div className="brand-text">
            <h1>VoiceIQ Sales</h1>
            <p>AI-powered quotes &amp; booking</p>
          </div>
        </div>

        <div className="header-actions">
          <span className="connection" role="status">
            <span className={`status-dot ${statusDotClass}`} />
            {statusLabel}
          </span>
          {shortSessionId && (
            <span className="session-id" aria-label={`Session ID: ${shortSessionId}`}>
              #{shortSessionId}
            </span>
          )}
          <button type="button" className="header-button" onClick={() => beginSession()}>
            {/* Plus / reset icon */}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New chat
          </button>
          <button
            type="button"
            className="header-button details-button"
            onClick={() => setDetailsOpen(true)}
            aria-haspopup="dialog"
          >
            {/* Inspect / layers icon */}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
            Details
            {(session?.toolEvents.length ?? 0) > 0 && (
              <span className="tool-badge" aria-label={`${session!.toolEvents.length} API calls`}>
                {session!.toolEvents.length}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="workspace">
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            {!session && <button type="button" onClick={() => beginSession()}>Retry connection</button>}
            {session && <button type="button" aria-label="Dismiss error" onClick={() => setError(null)}>×</button>}
          </div>
        )}
        <ConversationPanel
          messages={messages}
          stage={session?.stage ?? "COLLECTING"}
          sessionReady={Boolean(session)}
          isListening={voice.isListening}
          voiceSupported={voice.isSupported}
          interimTranscript={voice.interimTranscript}
          onSend={sendTurn}
          onRetry={retryTurn}
          onStartListening={startListening}
          onStopListening={voice.stopListening}
        />
      </main>

      <dialog
        ref={detailsRef}
        className="details-dialog"
        aria-label="Conversation details"
        onClose={() => setDetailsOpen(false)}
      >
        <Inspector
          session={session}
          tools={session?.toolEvents ?? []}
          onClose={() => setDetailsOpen(false)}
        />
      </dialog>
    </div>
  );
}
