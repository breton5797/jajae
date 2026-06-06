import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ClientSelection, Delivery, Site } from "@/lib/types";

/** Client-safe site projection (no budget / internal fields). */
export interface ClientProject {
  siteId: string;
  name: string;
  address: string;
}

export async function loadClientProjects(): Promise<{
  authed: boolean;
  projects: ClientProject[];
}> {
  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return { authed: false, projects: [] };

    // RLS scopes sites to invited ones (sites_client_select)
    const { data: sites } = await sb.from("sites").select("id, name, address");
    return {
      authed: true,
      projects: ((sites ?? []) as Pick<Site, "id" | "name" | "address">[]).map(
        (s) => ({ siteId: s.id, name: s.name, address: s.address }),
      ),
    };
  } catch {
    return { authed: false, projects: [] };
  }
}

export interface ClientProjectDetail {
  found: boolean;
  project: ClientProject | null;
  selections: ClientSelection[];
  deliveries: Array<Pick<Delivery, "id" | "status" | "scheduled_date">>;
}

export async function loadClientProjectDetail(
  siteId: string,
): Promise<ClientProjectDetail> {
  const empty: ClientProjectDetail = {
    found: false,
    project: null,
    selections: [],
    deliveries: [],
  };
  try {
    const sb = createServerSupabase();
    const { data: site } = await sb
      .from("sites")
      .select("id, name, address")
      .eq("id", siteId)
      .maybeSingle();
    if (!site) return empty;

    const [{ data: selections }, { data: deliveries }] = await Promise.all([
      sb.from("client_selections").select("*").eq("site_id", siteId),
      sb
        .from("deliveries")
        .select("id, status, scheduled_date")
        .eq("site_id", siteId)
        .order("scheduled_date"),
    ]);

    const s = site as Pick<Site, "id" | "name" | "address">;
    return {
      found: true,
      project: { siteId: s.id, name: s.name, address: s.address },
      selections: (selections ?? []) as ClientSelection[],
      deliveries: (deliveries ?? []) as Array<
        Pick<Delivery, "id" | "status" | "scheduled_date">
      >,
    };
  } catch {
    return empty;
  }
}
