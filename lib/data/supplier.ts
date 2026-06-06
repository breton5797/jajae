import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Product, PurchaseOrder, Supplier } from "@/lib/types";

export interface SupplierConsole {
  authed: boolean;
  supplier: Supplier | null;
  products: Product[];
  purchaseOrders: PurchaseOrder[];
}

const EMPTY: SupplierConsole = {
  authed: false,
  supplier: null,
  products: [],
  purchaseOrders: [],
};

export async function loadSupplierConsole(): Promise<SupplierConsole> {
  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return EMPTY;

    const { data: supplier } = await sb
      .from("suppliers")
      .select("*")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!supplier) return { ...EMPTY, authed: true };

    const [products, pos] = await Promise.all([
      sb
        .from("products")
        .select("*")
        .eq("supplier_id", supplier.id)
        .order("created_at", { ascending: false }),
      sb
        .from("purchase_orders")
        .select("*")
        .eq("supplier_id", supplier.id)
        .order("created_at", { ascending: false }),
    ]);

    return {
      authed: true,
      supplier: supplier as Supplier,
      products: (products.data ?? []) as Product[],
      purchaseOrders: (pos.data ?? []) as PurchaseOrder[],
    };
  } catch {
    return EMPTY;
  }
}
