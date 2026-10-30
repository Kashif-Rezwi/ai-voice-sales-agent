import { randomUUID } from "node:crypto";
import { Mutex } from "async-mutex";
import type { AgentTurnResponse, SessionState } from "../domain/types.js";

export class SessionNotFoundError extends Error {
  public constructor(sessionId: string) {
    super(`Session ${sessionId} was not found.`);
    this.name = "SessionNotFoundError";
  }
}

export interface LockedSession {
  state: SessionState;
  responseCache: Map<string, AgentTurnResponse>;
}

interface InternalSession extends LockedSession {
  mutex: Mutex;
}

export class SessionManager {
  private readonly sessions = new Map<string, InternalSession>();

  public createSession(): SessionState {
    const now = new Date().toISOString();
    const sessionId = `session_${randomUUID()}`;
    const state: SessionState = {
      sessionId,
      stage: "COLLECTING",
      turnCounter: 0,
      selectionVersion: 0,
      quoteCounter: 0,
      discountTier: 0,
      catalogFetched: false,
      selection: {
        skuId: null,
        planCode: null,
        requirementCount: null,
        quantity: null,
      },
      quote: null,
      booking: {
        status: "IDLE",
        idempotencyKey: null,
        record: null,
        error: null,
      },
      toolEvents: [],
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(sessionId, {
      state,
      mutex: new Mutex(),
      responseCache: new Map(),
    });
    return structuredClone(state);
  }

  public getState(sessionId: string): SessionState {
    const session = this.sessions.get(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    return structuredClone(session.state);
  }

  public async withLock<T>(
    sessionId: string,
    operation: (session: LockedSession) => Promise<T>,
  ): Promise<T> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    return session.mutex.runExclusive(() => operation(session));
  }
}
