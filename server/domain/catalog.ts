import type {
  CatalogApiResponse,
  CatalogItem,
  PlanCode,
  SkuId,
} from "./types.js";

export const CATALOG: Readonly<Record<SkuId, CatalogItem>> = Object.freeze({
  SKU_AIRPODS_PRO2: Object.freeze({
    name: "AirPods Pro 2nd Gen",
    maxCapacityPerUnit: 1,
    plans: Object.freeze({ STD: 24900, CARE: 27900 }),
  }),
  SKU_MESH_WIFI6: Object.freeze({
    name: "AeroMesh Wi-Fi 6E Home Pack",
    maxCapacityPerUnit: 2,
    plans: Object.freeze({ STD: 39900, PRO: 49900 }),
  }),
  SKU_TEAM_HUB: Object.freeze({
    name: "SyncHub Conference Bar",
    maxCapacityPerUnit: 3,
    plans: Object.freeze({ STD: 89900, PRO: 115000 }),
  }),
});

export function getCatalogInfo(): CatalogApiResponse {
  return Object.fromEntries(
    Object.entries(CATALOG).map(([skuId, item]) => [
      skuId,
      {
        name: item.name,
        max_capacity_per_unit: item.maxCapacityPerUnit,
        plans: Object.fromEntries(
          Object.entries(item.plans).map(([plan, cents]) => [plan, cents / 100]),
        ) as Partial<Record<PlanCode, number>>,
      },
    ]),
  ) as CatalogApiResponse;
}

export function isPlanAvailable(skuId: SkuId, planCode: PlanCode): boolean {
  return CATALOG[skuId].plans[planCode] !== undefined;
}

export function availablePlans(skuId: SkuId): PlanCode[] {
  return Object.keys(CATALOG[skuId].plans) as PlanCode[];
}
