export type SessionStage =
  | "COLLECTING"
  | "AWAITING_CONFIRMATION"
  | "BOOKING"
  | "BOOKED"
  | "BOOKING_FAILED";

export interface ToolEvent {
  id: string;
  toolName: "get_catalog_info" | "create_booking";
  status: "SUCCEEDED" | "FAILED";
  durationMs: number;
  deduplicated: boolean;
  input: unknown;
  output: unknown;
}

export interface SessionState {
  sessionId: string;
  turnCounter: number;
  stage: SessionStage;
  selectionVersion: number;
  discountTier: 0 | 1 | 2;
  selection: {
    skuId: string | null;
    planCode: string | null;
    requirementCount: number | null;
    quantity: number | null;
  };
  quote: Record<string, unknown> | null;
  booking: {
    status: string;
    idempotencyKey: string | null;
    record: Record<string, unknown> | null;
    error: string | null;
  };
  toolEvents: ToolEvent[];
}

export interface AgentTurnResponse {
  assistantMessage: string;
  state: SessionState;
  toolCalls: ToolEvent[];
  turnVersion: number;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "agent";
  text: string;
}
