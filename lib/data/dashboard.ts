import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type {
  AsRequest,
  Delivery,
  Order,
  PurchaseOrder,
  ReturnRequest,
  Site,
} from "@/lib/types";

export interface ContractorDashboard {
  authed: boolean;
  orders: Order[];
  purchaseOrders: PurchaseOrder[];
  deliveries: Delivery[];
  sites: Site[];
  returns: ReturnRequest[];
  asRequests: AsRequest[];
}

const EMPTY: ContractorDashboard = {
  authed: false,
  orders: [],
  purchaseOrders: [],
  deliveries: [],
  sites: [],
  returns: [],
  asRequests: [],
};

export async function loadContractorDashboard(): Promise<ContractorDashboard> {
  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return EMPTY;

    const [orders, pos, deliveries, sites, returns, asReqs] = await Promise.all([
      sb.from("orders").select("*").order("created_at", { ascending: false }),
      sb.from("purchase_orders").select("*"),
      sb.from("deliveries").select("*").order("scheduled_date"),
      sb.from("sites").select("*").order("created_at", { ascending: false }),
      sb.from("returns").select("*"),
      sb.from("as_requests").select("*"),
    ]);

    return {
      authed: true,
      orders: (orders.data ?? []) as Order[],
      purchaseOrders: (pos.data ?? []) as PurchaseOrder[],
      deliveries: (deliveries.data ?? []) as Delivery[],
      sites: (sites.data ?? []) as Site[],
      returns: (returns.data ?? []) as ReturnRequest[],
      asRequests: (asReqs.data ?? []) as AsRequest[],
    };
  } catch {
    return EMPTY;
  }
}
