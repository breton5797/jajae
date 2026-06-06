import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { computeSiteBudget } from "@/lib/projects";
import { lowestPriceAlerts } from "@/lib/pricing";
import type {
  Delivery,
  LowestPriceAlert,
  Order,
  Product,
  Site,
} from "@/lib/types";

export interface DashboardWidgets {
  authed: boolean;
  totalBudget: number;
  totalSpent: number;
  burnRatio: number;
  pendingDeliveries: Delivery[];
  alerts: LowestPriceAlert[];
}

const EMPTY: DashboardWidgets = {
  authed: false,
  totalBudget: 0,
  totalSpent: 0,
  burnRatio: 0,
  pendingDeliveries: [],
  alerts: [],
};

export async function loadDashboardWidgets(): Promise<DashboardWidgets> {
  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return EMPTY;

    const [{ data: sites }, { data: orders }, { data: deliveries }] =
      await Promise.all([
        sb.from("sites").select("*"),
        sb.from("orders").select("*"),
        sb
          .from("deliveries")
          .select("*")
          .in("status", ["scheduled", "in_transit", "delayed"])
          .order("scheduled_date"),
      ]);

    const siteRows = (sites ?? []) as Site[];
    const orderRows = (orders ?? []) as Order[];

    const totalBudget = siteRows.reduce((s, x) => s + x.budget, 0);
    const totalSpent = siteRows.reduce((sum, site) => {
      const b = computeSiteBudget(
        site.budget,
        orderRows.filter((o) => o.site_id === site.id),
      );
      return sum + b.spent;
    }, 0);

    // lowest-price alerts from the contractor's purchased items vs current catalog
    const { data: items } = await sb
      .from("order_items")
      .select("product_id, name_snapshot, unit_price_snapshot");
    const { data: products } = await sb
      .from("products")
      .select("*")
      .eq("status", "approved");
    const catalog = (products ?? []) as Product[];
    const byId = new Map(catalog.map((p) => [p.id, p]));

    const purchased = ((items ?? []) as Array<{
      product_id: string;
      name_snapshot: string;
      unit_price_snapshot: number;
    }>)
      .map((it) => {
        const prod = byId.get(it.product_id);
        return prod
          ? {
              productId: it.product_id,
              productName: it.name_snapshot,
              paidPrice: it.unit_price_snapshot,
              categoryId: prod.category_id,
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    return {
      authed: true,
      totalBudget,
      totalSpent,
      burnRatio: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) / 100 : 0,
      pendingDeliveries: (deliveries ?? []) as Delivery[],
      alerts: lowestPriceAlerts(purchased, catalog).slice(0, 5),
    };
  } catch {
    return EMPTY;
  }
}
