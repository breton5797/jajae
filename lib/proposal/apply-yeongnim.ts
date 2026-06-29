/**
 * lib/proposal/apply-yeongnim.ts
 * 영림 컬러 매치 가격 계산 + 예산 엔진 연동(겹치는 카테고리를 영림으로 교체) — 순수.
 * 단가는 샘플(material_catalog_items.unit_price, 추정) × 템플릿 수량(approxQuantity).
 */
import type {
  ApartmentTemplate, FinishCategory, FinishMaterial, FinishSelection,
} from "@/lib/types";
import { approxQuantity, wallAreaM2 } from "./quantities";
import type { YeongnimColor } from "./yeongnim";

/** 예산 엔진(finish_materials)과 겹치는 영림 카테고리 — 적용 시 교체 대상. */
export const OVERLAY_CATEGORIES: FinishCategory[] = [
  "flooring", "door", "kitchen", "furniture",
];

/** 영림 카테고리별 수량(예산 카테고리는 approxQuantity, film/wallpanel은 벽면적 기반). */
export function catalogQty(category: string, t: ApartmentTemplate): number {
  if ((OVERLAY_CATEGORIES as string[]).includes(category)) {
    return approxQuantity(category as FinishCategory, t).qty;
  }
  if (category === "film") return wallAreaM2(t);
  if (category === "wallpanel") return Math.round(wallAreaM2(t) * 0.35);
  return 0;
}

export interface PricedItem {
  category: string;
  modelCode: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

/** 선택 컬러의 카테고리별 수량×단가 + 소계(예산 카테고리만 합산). */
export function priceYeongnimColor(
  color: YeongnimColor, t: ApartmentTemplate,
): { items: PricedItem[]; subtotal: number } {
  const items = color.items.map((it) => {
    const qty = catalogQty(it.category, t);
    const unitPrice = it.unitPrice ?? 0;
    return { category: it.category, modelCode: it.modelCode, qty, unitPrice, lineTotal: Math.round(qty * unitPrice) };
  });
  const subtotal = items
    .filter((i) => (OVERLAY_CATEGORIES as string[]).includes(i.category))
    .reduce((s, i) => s + i.lineTotal, 0);
  return { items, subtotal };
}

function ylMaterial(color: YeongnimColor, category: FinishCategory, modelCode: string, unitPrice: number): FinishMaterial {
  return {
    id: `yl-${modelCode}`,
    category,
    tier: "premium",
    brandId: "yeongnim",
    brandName: "영림",
    label: `${color.series} (${modelCode})`,
    unitPrice,
    priceStatus: "estimated",
    color: color.color ?? undefined,
  };
}

/**
 * 겹치는 카테고리(flooring/door/kitchen/furniture)를 영림 제품으로 교체한 새 finishes 반환.
 * 기존 항목은 교체, 영림에만 있는 카테고리는 추가. 나머지는 그대로.
 */
export function applyYeongnimToFinishes(
  base: FinishSelection[], color: YeongnimColor, t: ApartmentTemplate,
): FinishSelection[] {
  const ylByCat = new Map(
    color.items.filter((i) => (OVERLAY_CATEGORIES as string[]).includes(i.category)).map((i) => [i.category, i]),
  );
  const sel = (cat: FinishCategory, modelCode: string, unitPrice: number): FinishSelection => {
    const qty = approxQuantity(cat, t).qty;
    return {
      category: cat,
      material: ylMaterial(color, cat, modelCode, unitPrice),
      qty,
      lineTotal: Math.round(qty * unitPrice),
      downgraded: false,
    };
  };

  const result = base.map((f) => {
    const yl = ylByCat.get(f.category);
    return yl ? sel(f.category, yl.modelCode, yl.unitPrice ?? 0) : f;
  });
  for (const [cat, yl] of ylByCat) {
    if (!base.some((f) => f.category === cat)) {
      result.push(sel(cat as FinishCategory, yl.modelCode, yl.unitPrice ?? 0));
    }
  }
  return result;
}
