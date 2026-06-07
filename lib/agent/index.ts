/**
 * lib/agent — autonomous procurement planner. Proposes reorder POs from forecast
 * + stock; it does NOT enforce policy (lib/policy + the DB trigger do that — the
 * planner is deliberately untrusted). Pure; depends on lib/types + lib/utils.
 * (Claude tool-use planning is an optional layer in ./ai.)
 */
import type { AgentPlan, PlanItem, Product } from "@/lib/types";
import { won } from "@/lib/utils";

export interface ReorderSignal {
  productId: string;
  suggestedQty: number;
}

/**
 * Plan reorders from forecast-driven signals. For each product needing reorder,
 * propose a PO to its supplier with a human-readable rationale.
 */
export function planReorders(
  signals: ReorderSignal[],
  products: Product[],
): AgentPlan {
  const byId = new Map(products.map((p) => [p.id, p]));
  const items: PlanItem[] = [];

  for (const sig of signals) {
    if (sig.suggestedQty <= 0) continue;
    const product = byId.get(sig.productId);
    if (!product) continue;
    const amount = won(product.unit_price * sig.suggestedQty);
    items.push({
      productId: product.id,
      supplierId: product.supplier_id,
      qty: sig.suggestedQty,
      amount,
      categoryId: product.category_id,
      rationale: `예측 수요 기반 재발주: ${product.name} ${sig.suggestedQty}개 (현재고 ${product.stock}, 예상 소진). 공급사 단가 ${product.unit_price}원 적용.`,
    });
  }

  const total = items.reduce((s, i) => s + i.amount, 0);
  return {
    items,
    summary: `${items.length}개 품목 재발주 제안, 총 ${total}원`,
    source: "deterministic",
  };
}
