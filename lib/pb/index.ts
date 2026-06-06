/**
 * lib/pb — private-label (자체브랜드) economics & recommendation. Pure; lib/types + utils.
 */
import type {
  CategoryDemand,
  PbCandidate,
  ProductStatus,
  ProductUnit,
} from "@/lib/types";
import { won } from "@/lib/utils";

/** Retail price for a PB SKU with margin baked in. */
export function computePbPrice(cost: number, marginRate: number): number {
  return won(cost * (1 + marginRate));
}

/** Heuristic margin potential for a category (more repeat orders → more leverage). */
function estimateMarginRate(d: CategoryDemand): number {
  const base = 0.1;
  const repeatBonus = (d.orderCount / (d.orderCount + 10)) * 0.2;
  return Math.round((base + repeatBonus) * 100) / 100; // 0.10 .. 0.30
}

/**
 * Rank PB candidate categories by margin potential × volume.
 * score = totalQty × avgPrice × estMarginRate  (estimated total margin KRW).
 */
export function recommendPbCandidates(
  demands: CategoryDemand[],
  limit = 5,
): PbCandidate[] {
  const scored = demands.map((d) => {
    const estMarginRate = estimateMarginRate(d);
    const score = won(d.totalQty * d.avgPrice * estMarginRate);
    return {
      categoryId: d.categoryId,
      categoryName: d.categoryName,
      totalQty: d.totalQty,
      orderCount: d.orderCount,
      avgPrice: d.avgPrice,
      estMarginRate,
      score,
      rank: 0,
    };
  });

  return scored
    .sort((a, b) => b.score - a.score || b.totalQty - a.totalQty)
    .slice(0, limit)
    .map((c, i) => ({ ...c, rank: i + 1 }));
}

export interface BuildPbProductInput {
  name: string;
  brand?: string;
  sku: string;
  categoryId: string;
  supplierId: string;
  cost: number;
  marginRate: number;
  unit?: ProductUnit;
  stock?: number;
  leadTimeDays?: number;
  spec?: Record<string, string | number | boolean>;
}

export interface PbProductRows {
  product: {
    supplier_id: string;
    category_id: string;
    name: string;
    brand: string;
    spec: Record<string, string | number | boolean>;
    unit: ProductUnit;
    unit_price: number;
    stock: number;
    lead_time_days: number;
    status: ProductStatus;
    is_pb: true;
    cost: number;
    margin_rate: number;
  };
  pb: {
    sku: string;
    category_id: string;
    cost: number;
    margin_rate: number;
    supplier_id: string;
  };
}

/** Produce the product row + pb_products row for a new PB SKU (margin baked in). */
export function buildPbProduct(input: BuildPbProductInput): PbProductRows {
  const unitPrice = computePbPrice(input.cost, input.marginRate);
  return {
    product: {
      supplier_id: input.supplierId,
      category_id: input.categoryId,
      name: input.name,
      brand: input.brand ?? "자재 PB",
      spec: input.spec ?? {},
      unit: input.unit ?? "ea",
      unit_price: unitPrice,
      stock: input.stock ?? 0,
      lead_time_days: input.leadTimeDays ?? 3,
      status: "approved",
      is_pb: true,
      cost: input.cost,
      margin_rate: input.marginRate,
    },
    pb: {
      sku: input.sku,
      category_id: input.categoryId,
      cost: input.cost,
      margin_rate: input.marginRate,
      supplier_id: input.supplierId,
    },
  };
}
