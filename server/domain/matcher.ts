import type { SkuId } from "./types.js";

const ALIASES: Readonly<Record<SkuId, readonly string[]>> = {
  SKU_AIRPODS_PRO2: [
    "airpods pro 2nd gen",
    "airpods pro 2",
    "airpods pro",
    "air pods pro",
    "airpods",
    "sku airpods pro2",
  ],
  SKU_MESH_WIFI6: [
    "aeromesh wi fi 6e home pack",
    "aeromesh wifi 6e",
    "aero mesh wifi",
    "aeromesh wifi",
    "aeromesh",
    "aero mesh",
    "arrow mesh wifi",
    "arrow mesh",
    "wifi 6e home pack",
    "sku mesh wifi6",
  ],
  SKU_TEAM_HUB: [
    "synchub conference bar",
    "sync hub conference bar",
    "synchub",
    "sync hub",
    "sink hub",
    "conference bar",
    "sku team hub",
  ],
};

export type CatalogMatch =
  | { status: "matched"; skuId: SkuId; matchedAlias: string; confidence: number }
  | { status: "unknown" }
  | { status: "ambiguous"; candidates: SkuId[] };

export function normalizeProductText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution =
        previous[rightIndex - 1]! +
        (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        substitution,
      );
    }
    previous = current;
  }
  return previous[right.length]!;
}

function similarity(left: string, right: string): number {
  const maximumLength = Math.max(left.length, right.length);
  return maximumLength === 0 ? 1 : 1 - levenshtein(left, right) / maximumLength;
}

function bestAliasScore(input: string, alias: string): number {
  if (input.includes(alias)) return 1;

  const inputTokens = input.split(" ");
  const aliasTokenCount = alias.split(" ").length;
  let best = 0;
  for (let size = Math.max(1, aliasTokenCount - 1); size <= aliasTokenCount + 1; size += 1) {
    for (let index = 0; index + size <= inputTokens.length; index += 1) {
      const window = inputTokens.slice(index, index + size).join(" ");
      best = Math.max(best, similarity(window, alias));
    }
  }
  return best;
}

export function matchCatalogItem(rawInput: string): CatalogMatch {
  const input = normalizeProductText(rawInput);
  if (!input) return { status: "unknown" };
  // A competing brand in the same phrase is not a safe catalog selection.
  if (/\b(netgear|orbi)\b/.test(input)) return { status: "unknown" };

  const ranked = (Object.entries(ALIASES) as Array<[SkuId, readonly string[]]>)
    .map(([skuId, aliases]) => {
      let confidence = 0;
      let matchedAlias = aliases[0]!;
      for (const alias of aliases) {
        const score = bestAliasScore(input, alias);
        if (score > confidence) {
          confidence = score;
          matchedAlias = alias;
        }
      }
      return { skuId, confidence, matchedAlias };
    })
    .sort((left, right) => right.confidence - left.confidence);

  const best = ranked[0]!;
  const runnerUp = ranked[1]!;
  if (best.confidence < 0.82) return { status: "unknown" };
  if (best.confidence - runnerUp.confidence < 0.08) {
    return {
      status: "ambiguous",
      candidates: ranked
        .filter((candidate) => best.confidence - candidate.confidence < 0.08)
        .map((candidate) => candidate.skuId),
    };
  }
  return {
    status: "matched",
    skuId: best.skuId,
    matchedAlias: best.matchedAlias,
    confidence: best.confidence,
  };
}
