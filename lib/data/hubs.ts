import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import type { Hub, HubInventory } from "@/lib/types";

export interface HubsView {
  hubs: Hub[];
  inventory: HubInventory[];
}

export async function loadHubs(): Promise<HubsView> {
  try {
    // service_role bypasses RLS — gate to admins before reading cross-tenant data
    if (!(await requireAdmin())) return { hubs: [], inventory: [] };
    const sb = createServiceSupabase();
    const [{ data: hubs }, { data: inv }] = await Promise.all([
      sb.from("hubs").select("*").order("created_at", { ascending: false }),
      sb.from("hub_inventory").select("*"),
    ]);
    return {
      hubs: (hubs ?? []) as Hub[],
      inventory: (inv ?? []) as HubInventory[],
    };
  } catch {
    return { hubs: [], inventory: [] };
  }
}
