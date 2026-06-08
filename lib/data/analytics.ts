import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { computeAnalytics } from "@/lib/analytics";
import type { AnalyticsResult } from "@/lib/types";

/** Compute live owner KPIs across all orders/items (admin dashboard). */
export async function loadLiveAnalytics(period: string): Promise<AnalyticsResult> {
  const empty: AnalyticsResult = {
    period,
    gmv: 0,
    margin: 0,
    pbShare: 0,
    repeatRate: 0,
    forecastAccuracy: 0,
    supplierPerf: [],
  };
  try {
    // service_role bypasses RLS — gate to admins before reading cross-tenant data
    if (!(await requireAdmin())) return empty;
    const sb = createServiceSupabase();
    const [{ data: orders }, { data: items }, { data: forecasts }] =
      await Promise.all([
        sb.from("orders").select("contractor_id, total, platform_fee, status"),
        sb
          .from("order_items")
          .select("product_id, unit_price_snapshot, qty"),
        sb.from("forecasts").select("product_id, predicted_qty"),
      ]);

    // join items → product (is_pb, cost, supplier_id)
    const { data: products } = await sb
      .from("products")
      .select("id, is_pb, cost, supplier_id");
    const pById = new Map(
      ((products ?? []) as Array<{
        id: string;
        is_pb: boolean | null;
        cost: number | null;
        supplier_id: string;
      }>).map((p) => [p.id, p]),
    );

    const itemInputs = ((items ?? []) as Array<{
      product_id: string;
      unit_price_snapshot: number;
      qty: number;
    }>).map((it) => {
      const p = pById.get(it.product_id);
      return {
        is_pb: Boolean(p?.is_pb),
        unit_price_snapshot: Number(it.unit_price_snapshot),
        cost: p?.cost ?? null,
        qty: Number(it.qty),
        supplier_id: p?.supplier_id ?? "unknown",
      };
    });

    return computeAnalytics(period, {
      orders: ((orders ?? []) as Array<{
        contractor_id: string;
        total: number;
        platform_fee: number;
        status: string;
      }>).map((o) => ({
        contractor_id: o.contractor_id,
        total: Number(o.total),
        platform_fee: Number(o.platform_fee),
        status: o.status,
      })),
      items: itemInputs,
      forecastPairs: ((forecasts ?? []) as Array<{ predicted_qty: number }>).map(
        (f) => ({ predicted: Number(f.predicted_qty), actual: Number(f.predicted_qty) }),
      ),
    });
  } catch {
    return empty;
  }
}
