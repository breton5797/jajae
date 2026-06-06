import "server-only";
import { createServiceSupabase, createServerSupabase } from "@/lib/supabase/server";
import type { DeliveryRun, OpenPoForBatching, Order, Site } from "@/lib/types";

/** Open POs (ready to batch) joined with their site region/date/coords. Admin view. */
export async function loadOpenPosForBatching(): Promise<OpenPoForBatching[]> {
  try {
    const sb = createServiceSupabase();
    const [{ data: pos }, { data: orders }, { data: sites }] = await Promise.all([
      sb
        .from("purchase_orders")
        .select("id, supplier_id, order_id, track_status")
        .in("track_status", ["ready"]),
      sb.from("orders").select("id, site_id"),
      sb.from("sites").select("*"),
    ]);

    const orderById = new Map(
      ((orders ?? []) as Pick<Order, "id" | "site_id">[]).map((o) => [o.id, o]),
    );
    const siteById = new Map(((sites ?? []) as Site[]).map((s) => [s.id, s]));

    const result: OpenPoForBatching[] = [];
    for (const po of (pos ?? []) as Array<{
      id: string;
      supplier_id: string;
      order_id: string;
    }>) {
      const order = orderById.get(po.order_id);
      const site = order?.site_id ? siteById.get(order.site_id) : null;
      if (!site || !site.region || !site.scheduled_date) continue;
      result.push({
        poId: po.id,
        supplierId: po.supplier_id,
        siteId: site.id,
        region: site.region,
        date: site.scheduled_date,
        lat: site.lat,
        lng: site.lng,
      });
    }
    return result;
  } catch {
    return [];
  }
}

export async function loadDeliveryRuns(): Promise<DeliveryRun[]> {
  try {
    const sb = createServerSupabase();
    const { data } = await sb
      .from("delivery_runs")
      .select("*")
      .order("run_date", { ascending: false });
    return (data ?? []) as DeliveryRun[];
  } catch {
    return [];
  }
}
