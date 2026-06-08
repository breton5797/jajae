import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { recommendPbCandidates } from "@/lib/pb";
import type { Category, PbCandidate, CategoryDemand } from "@/lib/types";

/** Aggregate order_items demand by category for PB recommendation (admin view). */
export async function loadPbDemand(): Promise<CategoryDemand[]> {
  try {
    // service_role bypasses RLS — gate to admins before reading cross-tenant data
    if (!(await requireAdmin())) return [];
    const sb = createServiceSupabase();
    const [{ data: items }, { data: products }, { data: cats }] =
      await Promise.all([
        sb.from("order_items").select("product_id, qty, unit_price_snapshot"),
        sb.from("products").select("id, category_id"),
        sb.from("categories").select("*"),
      ]);

    const catById = new Map(((cats ?? []) as Category[]).map((c) => [c.id, c]));
    const prodCat = new Map(
      ((products ?? []) as Array<{ id: string; category_id: string }>).map(
        (p) => [p.id, p.category_id],
      ),
    );

    const agg = new Map<
      string,
      { qty: number; count: number; priceSum: number }
    >();
    for (const it of (items ?? []) as Array<{
      product_id: string;
      qty: number;
      unit_price_snapshot: number;
    }>) {
      const catId = prodCat.get(it.product_id);
      if (!catId) continue;
      const cur = agg.get(catId) ?? { qty: 0, count: 0, priceSum: 0 };
      agg.set(catId, {
        qty: cur.qty + Number(it.qty),
        count: cur.count + 1,
        priceSum: cur.priceSum + Number(it.unit_price_snapshot),
      });
    }

    return [...agg.entries()].map(([catId, a]) => ({
      categoryId: catId,
      categoryName: catById.get(catId)?.name ?? catId,
      totalQty: a.qty,
      orderCount: a.count,
      avgPrice: a.count > 0 ? Math.round(a.priceSum / a.count) : 0,
    }));
  } catch {
    return [];
  }
}

export async function loadPbCandidates(): Promise<PbCandidate[]> {
  return recommendPbCandidates(await loadPbDemand());
}
