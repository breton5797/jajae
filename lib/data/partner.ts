import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ApiClient, ApiLog, Webhook } from "@/lib/types";

export interface PartnerConsole {
  authed: boolean;
  clients: ApiClient[];
  webhooks: Webhook[];
  recentLogs: ApiLog[];
}

const EMPTY: PartnerConsole = {
  authed: false,
  clients: [],
  webhooks: [],
  recentLogs: [],
};

export async function loadPartnerConsole(): Promise<PartnerConsole> {
  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return EMPTY;

    const [{ data: clients }, { data: webhooks }, { data: logs }] =
      await Promise.all([
        sb.from("api_clients").select("*").order("created_at", { ascending: false }),
        sb.from("webhooks").select("*"),
        sb.from("api_logs").select("*").order("ts", { ascending: false }).limit(20),
      ]);

    return {
      authed: true,
      clients: (clients ?? []) as ApiClient[],
      webhooks: (webhooks ?? []) as Webhook[],
      recentLogs: (logs ?? []) as ApiLog[],
    };
  } catch {
    return EMPTY;
  }
}
