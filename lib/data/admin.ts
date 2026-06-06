import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Product, ReturnRequest, Supplier } from "@/lib/types";

export interface AdminConsole {
  authed: boolean;
  pendingSuppliers: Supplier[];
  pendingProducts: Product[];
  openReturns: ReturnRequest[];
}

const EMPTY: AdminConsole = {
  authed: false,
  pendingSuppliers: [],
  pendingProducts: [],
  openReturns: [],
};

export async function loadAdminConsole(): Promise<AdminConsole> {
  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return EMPTY;

    const [suppliers, products, returns] = await Promise.all([
      sb.from("suppliers").select("*").neq("status", "verified"),
      sb.from("products").select("*").eq("status", "pending"),
      sb.from("returns").select("*").eq("status", "requested"),
    ]);

    return {
      authed: true,
      pendingSuppliers: (suppliers.data ?? []) as Supplier[],
      pendingProducts: (products.data ?? []) as Product[],
      openReturns: (returns.data ?? []) as ReturnRequest[],
    };
  } catch {
    return EMPTY;
  }
}
