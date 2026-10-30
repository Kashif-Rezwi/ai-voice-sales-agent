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

  const status = error && !session
    ? "Connection failed"
    : !session
      ? "Connecting"
      : pendingTurns > 0
        ? "Replying"
        : "Ready";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">S</span>
          <div>
            <h1>Sales assistant</h1>
            <p>Find a package, get a quote, book with confidence.</p>
          </div>
        </div>
        <div className="header-actions">
          <span className="connection" role="status"><span className="status-dot" />{status}</span>
          <button type="button" className="header-button" onClick={() => beginSession()}>
            New chat
          </button>
          <button
            type="button"
            className="header-button details-button"
            onClick={() => setDetailsOpen(true)}
            aria-haspopup="dialog"
          >
            Details{session?.toolEvents.length ? ` · ${session.toolEvents.length}` : ""}
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
