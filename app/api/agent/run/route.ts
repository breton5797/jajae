import { NextResponse } from "next/server";
import { planReorders, type ReorderSignal } from "@/lib/agent";
import { evaluatePlan, sumNetAgentSpend } from "@/lib/policy";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadReorderOverview } from "@/lib/data/forecast";
import type { AgentPolicy, PlanItem, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

type SB = ReturnType<typeof createServerSupabase>;

/** Net agent-originated spend already committed (auto + approved − reversals). */
async function loadAlreadySpent(sb: SB, contractorId: string): Promise<number> {
  const { data } = await sb
    .from("agent_audit_log")
    .select("action, amount")
    .eq("contractor_id", contractorId)
    .in("action", ["auto_po", "approve_execute", "reversal"]);
  return sumNetAgentSpend((data ?? []) as Array<{ action: string; amount: number }>);
}

/**
 * Execute each within-policy item atomically via RPC; returns how many ran.
 * The policy trigger re-validates each and rolls back on any breach (e.g. a race
 * past the cap), so a blocked item is simply skipped.
 */
async function executeAutoItems(
  sb: SB,
  contractorId: string,
  items: PlanItem[],
  reversibleUntil: string,
): Promise<number> {
  let auto = 0;
  for (const item of items) {
    const { error } = await sb.rpc("agent_execute_auto", {
      p_contractor: contractorId,
      p_supplier: item.supplierId,
      p_amount: item.amount,
      p_rationale: item.rationale,
      p_plan: item,
      p_reversible_until: reversibleUntil,
    });
    if (error) continue;
    auto += 1;
  }
  return auto;
}

/** Queue each over-threshold item for human approval. */
async function escalateItems(sb: SB, contractorId: string, items: PlanItem[]): Promise<void> {
  for (const item of items) {
    await sb.from("agent_decisions").insert({
      contractor_id: contractorId,
      action: "reorder",
      rationale: "정책 임계값 초과 — 사람 승인 필요",
      status: "escalated",
      plan: item,
    });
  }
}

/**
 * Run the procurement agent for the current contractor. Plans reorders from
 * forecast, then SERVER-ENFORCES policy: within-bound items auto-execute (each
 * atomically via RPC); the rest are escalated to the decision queue.
 */
export async function POST() {
  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const { data: policyRow } = await sb
      .from("agent_policies")
      .select("*")
      .eq("contractor_id", user.id)
      .maybeSingle();
    if (!policyRow) {
      return NextResponse.json({ error: "자율 운영 정책이 없습니다." }, { status: 400 });
    }
    const policy = policyRow as AgentPolicy;
    if (!policy.enabled) {
      return NextResponse.json({ halted: true, reason: "킬스위치 작동 중" });
    }

    const overview = await loadReorderOverview();
    const signals: ReorderSignal[] = overview.rows
      .filter((r) => r.needsReorder && r.suggestedQty > 0)
      .map((r) => ({ productId: r.productId, suggestedQty: r.suggestedQty }));
    if (signals.length === 0) {
      return NextResponse.json({ auto: 0, escalated: 0, message: "재발주 대상 없음" });
    }

    const { data: prodRows } = await sb
      .from("products")
      .select("*")
      .in("id", signals.map((s) => s.productId));
    const plan = planReorders(signals, (prodRows ?? []) as Product[]);

    // Carry already-committed agent-originated spend so spend_cap holds ACROSS runs.
    const alreadySpent = await loadAlreadySpent(sb, user.id);
    const evalResult = evaluatePlan(plan.items, policy, alreadySpent);

    const reversibleUntil = new Date(Date.now() + 86_400_000).toISOString();
    const auto = await executeAutoItems(sb, user.id, evalResult.autoItems, reversibleUntil);
    await escalateItems(sb, user.id, evalResult.escalateItems);

    return NextResponse.json({
      auto,
      escalated: evalResult.escalateItems.length,
      rejected: evalResult.rejectedItems.length,
    });
  } catch (e) {
    console.error("agent run failed:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
