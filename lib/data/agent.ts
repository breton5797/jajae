import "server-only";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import type {
  AgentAction,
  AgentDecision,
  AgentOpsStats,
  AgentPolicy,
} from "@/lib/types";

export interface AgentConsole {
  authed: boolean;
  policy: AgentPolicy | null;
  queue: AgentDecision[];
  recent: AgentDecision[];
  actions: AgentAction[];
}

const EMPTY: AgentConsole = {
  authed: false,
  policy: null,
  queue: [],
  recent: [],
  actions: [],
};

export async function loadAgentConsole(): Promise<AgentConsole> {
  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return EMPTY;

    const [{ data: policy }, { data: decisions }, { data: actions }] =
      await Promise.all([
        sb.from("agent_policies").select("*").eq("contractor_id", user.id).maybeSingle(),
        sb
          .from("agent_decisions")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
        sb
          .from("agent_actions")
          .select("*")
          .order("executed_at", { ascending: false })
          .limit(50),
      ]);

    const decs = (decisions ?? []) as AgentDecision[];
    return {
      authed: true,
      policy: (policy as AgentPolicy) ?? null,
      queue: decs.filter((d) => d.status === "escalated"),
      recent: decs,
      actions: (actions ?? []) as AgentAction[],
    };
  } catch {
    return EMPTY;
  }
}

/** Admin agent-ops stats: autonomous PO volume, escalation rate, interventions. */
export async function loadAgentOps(): Promise<AgentOpsStats> {
  const empty: AgentOpsStats = {
    autoPoCount: 0,
    autoPoValue: 0,
    escalations: 0,
    escalationRate: 0,
    interventions: 0,
  };
  try {
    // service_role bypasses RLS — gate to admins before reading cross-tenant data
    if (!(await requireAdmin())) return empty;
    const sb = createServiceSupabase();
    const [{ data: decisions }, { data: audit }] = await Promise.all([
      sb.from("agent_decisions").select("status, plan"),
      sb.from("agent_audit_log").select("action, amount"),
    ]);
    const decs = (decisions ?? []) as Array<{ status: string; plan: { amount?: number } }>;
    const autos = decs.filter((d) => d.status === "auto_executed");
    const escalations = decs.filter((d) => d.status === "escalated").length;
    const interventions = ((audit ?? []) as Array<{ action: string }>).filter(
      (a) => a.action === "reversal" || a.action === "reject" || a.action === "approve_execute",
    ).length;
    const total = decs.length || 1;

    return {
      autoPoCount: autos.length,
      autoPoValue: autos.reduce((s, d) => s + Number(d.plan?.amount ?? 0), 0),
      escalations,
      escalationRate: Math.round((escalations / total) * 100) / 100,
      interventions,
    };
  } catch {
    return empty;
  }
}
