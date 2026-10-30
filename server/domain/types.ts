export type SkuId = "SKU_AIRPODS_PRO2" | "SKU_MESH_WIFI6" | "SKU_TEAM_HUB";
export type PlanCode = "STD" | "CARE" | "PRO";
export type PromoCode = "SAVE10" | "CLOSENOW15" | null;
export type DiscountTier = 0 | 1 | 2;

export type SessionStage =
  | "COLLECTING"
  | "AWAITING_CONFIRMATION"
  | "BOOKING"
  | "BOOKED"
  | "BOOKING_FAILED";

export interface CatalogItem {
  name: string;
  maxCapacityPerUnit: number;
  plans: Partial<Record<PlanCode, number>>;
}

export interface CatalogApiItem {
  name: string;
  max_capacity_per_unit: number;
  plans: Partial<Record<PlanCode, number>>;
}

export type CatalogApiResponse = Record<SkuId, CatalogApiItem>;

export interface Selection {
  skuId: SkuId | null;
  planCode: PlanCode | null;
  requirementCount: number | null;
  quantity: number | null;
}

export interface Quote {
  version: number;
  selectionVersion: number;
  presentedAtTurn: number;
  skuId: SkuId;
  packageName: string;
  planCode: PlanCode;
  requirementCount: number;
  quantity: number;
  unitPriceCents: number;
  baseTotalCents: number;
  discountTier: DiscountTier;
  discountPercent: 0 | 10 | 15;
  promoCode: PromoCode;
  finalPriceCents: number;
  fingerprint: string;
}

export interface BookingInput {
  sku_id: SkuId;
  plan_code: PlanCode;
  quantity: number;
  promo_code: PromoCode;
  final_price: number;
}

export interface BookingRecord extends BookingInput {
  booking_id: string;
  idempotency_key: string;
  created_at: string;
}

export interface BookingState {
  status: "IDLE" | "IN_FLIGHT" | "SUCCEEDED" | "FAILED";
  idempotencyKey: string | null;
  record: BookingRecord | null;
  error: string | null;
}

export interface ToolEvent {
  id: string;
  turn: number;
  requestId: string;
  toolName: "get_catalog_info" | "create_booking";
  input: unknown;
  output: unknown;
  status: "SUCCEEDED" | "FAILED";
  deduplicated: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export interface SessionState {
  sessionId: string;
  stage: SessionStage;
  turnCounter: number;
  selectionVersion: number;
  quoteCounter: number;
  discountTier: DiscountTier;
  catalogFetched: boolean;
  selection: Selection;
  quote: Quote | null;
  booking: BookingState;
  toolEvents: ToolEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentTurnResponse {
  sessionId: string;
  requestId: string;
  assistantMessage: string;
  state: SessionState;
  toolCalls: ToolEvent[];
  turnVersion: number;
}
