import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  computeSiteBudget,
  buildOrderTimeline,
  scheduleProgress,
} from "@/lib/projects";
import type {
  Order,
  OrderTimelinePoint,
  ScheduleProgress,
  Site,
  SiteBudget,
  SiteDocument,
  SiteTask,
} from "@/lib/types";

export interface SiteWithBudget {
  site: Site;
  budget: SiteBudget;
}

export async function loadSitesWithBudget(): Promise<{
  authed: boolean;
  sites: SiteWithBudget[];
}> {
  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return { authed: false, sites: [] };

    const [{ data: sites }, { data: orders }] = await Promise.all([
      sb.from("sites").select("*").order("created_at", { ascending: false }),
      sb.from("orders").select("*"),
    ]);

    const orderRows = (orders ?? []) as Order[];
    const result = ((sites ?? []) as Site[]).map((site) => ({
      site,
      budget: computeSiteBudget(
        site.budget,
        orderRows.filter((o) => o.site_id === site.id),
      ),
    }));
    return { authed: true, sites: result };
  } catch {
    return { authed: false, sites: [] };
  }
}

export interface SiteWorkspace {
  authed: boolean;
  site: Site | null;
  budget: SiteBudget;
  timeline: OrderTimelinePoint[];
  tasks: SiteTask[];
  schedule: ScheduleProgress;
  documents: SiteDocument[];
}

const EMPTY_BUDGET: SiteBudget = {
  budget: 0,
  spent: 0,
  remaining: 0,
  burnRatio: 0,
  overBudget: false,
};

export async function loadSiteWorkspace(siteId: string): Promise<SiteWorkspace> {
  const empty: SiteWorkspace = {
    authed: false,
    site: null,
    budget: EMPTY_BUDGET,
    timeline: [],
    tasks: [],
    schedule: { total: 0, done: 0, ratio: 0, nextTask: null },
    documents: [],
  };
  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return empty;

    const { data: site } = await sb
      .from("sites")
      .select("*")
      .eq("id", siteId)
      .maybeSingle();
    if (!site) return { ...empty, authed: true };

    const [{ data: orders }, { data: tasks }, { data: docs }] =
      await Promise.all([
        sb.from("orders").select("*").eq("site_id", siteId),
        sb.from("site_tasks").select("*").eq("site_id", siteId),
        sb.from("site_documents").select("*").eq("site_id", siteId),
      ]);

    const orderRows = (orders ?? []) as Order[];
    const taskRows = (tasks ?? []) as SiteTask[];
    const typedSite = site as Site;

    return {
      authed: true,
      site: typedSite,
      budget: computeSiteBudget(typedSite.budget, orderRows),
      timeline: buildOrderTimeline(orderRows),
      tasks: taskRows,
      schedule: scheduleProgress(taskRows),
      documents: (docs ?? []) as SiteDocument[],
    };
  } catch {
    return empty;
  }
}
