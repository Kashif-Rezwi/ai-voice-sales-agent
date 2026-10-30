import { useCallback, useEffect, useRef, useState } from "react";
import { createSession, sendMessage } from "./api";
import { ConversationPanel } from "./components/ConversationPanel";
import { Inspector } from "./components/Inspector";
import { useVoiceInput } from "./hooks/useVoiceInput";
import type { ConversationMessage, SessionState, ToolEvent } from "./types";

let initialSessionRequest: Promise<SessionState> | null = null;

function loadInitialSession(): Promise<SessionState> {
  initialSessionRequest ??= createSession();
  return initialSessionRequest;
}

export function App() {
  const responseGeneration = useRef(0);
  const latestTurnVersion = useRef(0);
  const [session, setSession] = useState<SessionState | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [tools, setTools] = useState<ToolEvent[]>([]);
  const [pendingTurns, setPendingTurns] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const showError = useCallback((message: string) => setError(message), []);

  useEffect(() => {
    let active = true;
    void loadInitialSession()
      .then((created) => {
        if (active) setSession(created);
      })
      .catch((reason: unknown) => {
        if (active) showError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      active = false;
    };
  }, [showError]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 6000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const sendTurn = useCallback(
    (rawMessage: string, suppliedRequestId?: string) => {
      const message = rawMessage.trim();
      const sessionId = session?.sessionId;
      if (!message || !sessionId) return;

      const requestId = suppliedRequestId ?? crypto.randomUUID();
      const generation = ++responseGeneration.current;
      window.speechSynthesis?.cancel();
      setMessages((current) => [
        ...current,
        { id: `user_${requestId}`, role: "user", text: message },
      ]);
      setPendingTurns((count) => count + 1);

      void sendMessage(sessionId, requestId, message)
        .then((result) => {
          if (result.turnVersion >= latestTurnVersion.current) {
            latestTurnVersion.current = result.turnVersion;
            setSession(result.state);
            setTools(result.state.toolEvents);
          }
          setMessages((current) => [
            ...current,
            { id: `agent_${requestId}`, role: "agent", text: result.assistantMessage },
          ]);

          if (generation === responseGeneration.current && "speechSynthesis" in window) {
            const utterance = new SpeechSynthesisUtterance(result.assistantMessage);
            utterance.rate = 1;
            window.speechSynthesis.speak(utterance);
          }
        })
        .catch((reason: unknown) => {
          showError(reason instanceof Error ? reason.message : String(reason));
        })
        .finally(() => setPendingTurns((count) => Math.max(0, count - 1)));
    },
    [session?.sessionId, showError],
  );

  const voice = useVoiceInput(sendTurn, showError);
  const connectionLabel = error
    ? "Action failed"
    : pendingTurns > 0
      ? "Processing"
      : session
        ? "Ready"
        : "Starting session";
  const connectionMode = error ? "error" : session ? "ready" : "starting";

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">S</span>
          <div>
            <p className="eyebrow">Deterministic commerce demo</p>
            <h1>Sales Agent Console</h1>
          </div>
        </div>
        <div className="header-meta">
          <span className="mode-chip">React · free model path</span>
          <div className={`connection ${connectionMode}`} aria-live="polite">
            <span className="status-dot" aria-hidden="true" />
            <span>{connectionLabel}</span>
          </div>
        </div>
      </header>

      <main className="workspace">
        <ConversationPanel
          messages={messages}
          stage={session?.stage ?? "COLLECTING"}
          sessionReady={Boolean(session)}
          pendingTurns={pendingTurns}
          isListening={voice.isListening}
          voiceSupported={voice.isSupported}
          interimTranscript={voice.interimTranscript}
          onSend={sendTurn}
          onStartListening={voice.startListening}
          onStopListening={voice.stopListening}
        />
        <Inspector session={session} tools={tools} />
      </main>

      {error && <div className="toast" role="alert">{error}</div>}
    </>
  );
}
