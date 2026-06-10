import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import type { TriagePolicy, AsTriagePolicy } from "@/lib/types";

export interface TriageQueueRow {
  id: string;
  reason: string;
  qty: number;
  refundAmount: number;
  productName: string;
  lastDecision: string | null;
  lastRationale: string | null;
}

export interface TriageConsole {
  authed: boolean;
  policy: TriagePolicy | null;
  queue: TriageQueueRow[];
}

const EMPTY: TriageConsole = { authed: false, policy: null, queue: [] };

interface RawRow {
  id: string;
  reason: string;
  qty: number;
  order_items: { unit_price_snapshot: number; name_snapshot: string } | null;
  triage_decisions: Array<{ decision: string; rationale: string; created_at: string }>;
}

export async function loadTriageConsole(): Promise<TriageConsole> {
  try {
    if (!(await requireAdmin())) return EMPTY;
    const sb = createServiceSupabase();
    const [{ data: policy }, { data: rows }] = await Promise.all([
      sb.from("triage_policies").select("*").eq("singleton", true).maybeSingle(),
      sb
        .from("returns")
        .select(
          "id, reason, qty, order_items(unit_price_snapshot, name_snapshot), triage_decisions(decision, rationale, created_at)",
        )
        .eq("status", "requested")
        .order("created_at", { ascending: true })
        .limit(100),
    ]);

    const queue: TriageQueueRow[] = ((rows ?? []) as unknown as RawRow[]).map((r) => {
      const unit = r.order_items?.unit_price_snapshot ?? 0;
      const decs = [...(r.triage_decisions ?? [])].sort((a, b) =>
        a.created_at < b.created_at ? 1 : -1,
      );
      const last = decs[0] ?? null;
      return {
        id: r.id,
        reason: r.reason,
        qty: r.qty,
        refundAmount: r.qty * unit,
        productName: r.order_items?.name_snapshot ?? "",
        lastDecision: last?.decision ?? null,
        lastRationale: last?.rationale ?? null,
      };
    });

    return { authed: true, policy: (policy as TriagePolicy) ?? null, queue };
  } catch {
    return EMPTY;
  }
}

export interface AsTriageQueueRow {
  id: string;
  issue: string;
  productName: string;
  lastDecision: string | null;
  lastRationale: string | null;
}

export interface AsTriageConsole {
  authed: boolean;
  policy: AsTriagePolicy | null;
  queue: AsTriageQueueRow[];
}

const AS_EMPTY: AsTriageConsole = { authed: false, policy: null, queue: [] };

interface AsRawRow {
  id: string;
  issue: string;
  order_items: { name_snapshot: string } | null;
  as_triage_decisions: Array<{ decision: string; rationale: string; created_at: string }>;
}

export async function loadAsTriageConsole(): Promise<AsTriageConsole> {
  try {
    if (!(await requireAdmin())) return AS_EMPTY;
    const sb = createServiceSupabase();
    const [{ data: policy }, { data: rows }] = await Promise.all([
      sb.from("as_triage_policies").select("*").eq("singleton", true).maybeSingle(),
      sb
        .from("as_requests")
        .select(
          "id, issue, order_items(name_snapshot), as_triage_decisions(decision, rationale, created_at)",
        )
        .eq("status", "requested")
        .order("created_at", { ascending: true })
        .limit(100),
    ]);

    const queue: AsTriageQueueRow[] = ((rows ?? []) as unknown as AsRawRow[]).map((r) => {
      const decs = [...(r.as_triage_decisions ?? [])].sort((a, b) =>
        a.created_at < b.created_at ? 1 : -1,
      );
      const last = decs[0] ?? null;
      return {
        id: r.id,
        issue: r.issue,
        productName: r.order_items?.name_snapshot ?? "",
        lastDecision: last?.decision ?? null,
        lastRationale: last?.rationale ?? null,
      };
    });

    return { authed: true, policy: (policy as AsTriagePolicy) ?? null, queue };
  } catch {
    return AS_EMPTY;
  }
}
