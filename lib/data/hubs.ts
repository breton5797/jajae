import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";
import type { Hub, HubInventory } from "@/lib/types";

export interface HubsView {
  hubs: Hub[];
  inventory: HubInventory[];
}

export async function loadHubs(): Promise<HubsView> {
  try {
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
