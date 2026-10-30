import type { AgentTurnResponse, SessionState } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? `Request failed with HTTP ${response.status}.`);
  }
  return body;
}

export function createSession(): Promise<SessionState> {
  return request<SessionState>("/api/sessions", { method: "POST" });
}

export function sendMessage(
  sessionId: string,
  requestId: string,
  message: string,
): Promise<AgentTurnResponse> {
  return request<AgentTurnResponse>(`/api/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId, message }),
  });
}
