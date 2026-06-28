/** 예산/스펙 기반 카테고리별 마감재 선택 + 예산 초과 시 강등 (순수·결정론). */
import type {
  ApartmentTemplate, EstimateBrief, FinishCategory, FinishMaterial,
  FinishSelection, FinishTier, SpecLevel,
} from "@/lib/types";
import { approxQuantity } from "./quantities";

const TIER_RANK: Record<FinishTier, number> = { economy: 0, standard: 1, premium: 2 };
const SPEC_TO_TIER: Record<SpecLevel, FinishTier> = {
  economy: "economy", standard: "standard", premium: "premium",
};
// 강등 우선순위: 체감 낮은 카테고리부터 (앞쪽 먼저 내림)
const DOWNGRADE_ORDER: FinishCategory[] = [
  "film", "board", "molding", "lighting", "wallpaper", "paint",
  "tile", "door", "window", "furniture", "engineered_stone",
  "kitchen", "sanitaryware", "flooring",
];

function lowerTier(t: FinishTier): FinishTier {
  return t === "premium" ? "standard" : "economy";
}

/** 해당 카테고리에서 목표 티어(없으면 인접 하위→상위) 중 최저가 1종. */
function pickMaterial(
  catalog: FinishMaterial[], category: FinishCategory, tier: FinishTier,
): FinishMaterial | null {
  const order: FinishTier[] =
    tier === "premium" ? ["premium", "standard", "economy"]
    : tier === "standard" ? ["standard", "economy", "premium"]
    : ["economy", "standard", "premium"];
  for (const t of order) {
    const cands = catalog
      .filter((m) => m.category === category && m.tier === t)
      .sort((a, b) => a.unitPrice - b.unitPrice);
    if (cands.length > 0) return cands[0]!;
  }
  return null;
}

export function materialsTotal(sel: FinishSelection[]): number {
  return sel.reduce((s, x) => s + x.lineTotal, 0);
}

export function selectFinishes(
  brief: EstimateBrief, template: ApartmentTemplate, catalog: FinishMaterial[],
): FinishSelection[] {
  const baseTier = SPEC_TO_TIER[brief.specLevel];
  const categories = Array.from(new Set(catalog.map((m) => m.category))) as FinishCategory[];
  const chosen = new Map<FinishCategory, FinishTier>();
  categories.forEach((c) => chosen.set(c, baseTier));

  const build = (): FinishSelection[] => {
    const out: FinishSelection[] = [];
    for (const c of categories) {
      const tier = chosen.get(c)!;
      const mat = pickMaterial(catalog, c, tier);
      if (!mat) continue;
      const { qty } = approxQuantity(c, template);
      out.push({
        category: c, material: mat, qty,
        lineTotal: Math.round(qty * mat.unitPrice),
        downgraded: TIER_RANK[mat.tier] < TIER_RANK[baseTier],
      });
    }
    return out;
  };

  let selections = build();
  const budget = brief.budgetKRW;
  if (budget && budget > 0) {
    let guard = 0;
    while (materialsTotal(selections) > budget && guard < 200) {
      const target = DOWNGRADE_ORDER.find(
        (c) => categories.includes(c) && chosen.get(c) !== "economy",
      );
      if (!target) break; // 모두 economy → 더 못 내림
      chosen.set(target, lowerTier(chosen.get(target)!));
      selections = build();
      guard += 1;
    }
  }
  return selections;
}
