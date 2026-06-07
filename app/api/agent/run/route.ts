import { NextResponse } from "next/server";
import { planReorders, type ReorderSignal } from "@/lib/agent";
import { evaluatePlan, sumNetAgentSpend } from "@/lib/policy";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadReorderOverview } from "@/lib/data/forecast";
import type { AgentPolicy, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Run the procurement agent for the current contractor. Plans reorders from
 * forecast, then SERVER-ENFORCES policy: only within-bound items auto-execute;
 * the rest are escalated to the decision queue. (DB trigger re-checks on write.)
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

    // forecast-driven reorder signals
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

    // Carry already-committed agent-originated spend (auto + approved, net of
    // reversals) so spend_cap holds ACROSS runs, not just within one batch.
    const { data: spentRows } = await sb
      .from("agent_audit_log")
      .select("action, amount")
      .eq("contractor_id", user.id)
      .in("action", ["auto_po", "approve_execute", "reversal"]);
    const alreadySpent = sumNetAgentSpend(
      (spentRows ?? []) as Array<{ action: string; amount: number }>,
    );
    const evalResult = evaluatePlan(plan.items, policy, alreadySpent);

    const reversibleUntil = new Date(Date.now() + 86_400_000).toISOString();
    let auto = 0;

    // Each auto item executes atomically in one transaction (order+PO+decision+
    // action+audit); the policy trigger re-validates and rolls back on any breach.
    for (const item of evalResult.autoItems) {
      const { error } = await sb.rpc("agent_execute_auto", {
        p_contractor: user.id,
        p_supplier: item.supplierId,
        p_amount: item.amount,
        p_rationale: item.rationale,
        p_plan: item,
        p_reversible_until: reversibleUntil,
      });
      if (error) continue; // blocked by DB policy guard (e.g. race past cap)
      auto += 1;
    }

    for (const item of evalResult.escalateItems) {
      await sb.from("agent_decisions").insert({
        contractor_id: user.id,
        action: "reorder",
        rationale: "정책 임계값 초과 — 사람 승인 필요",
        status: "escalated",
        plan: item,
      });
    }

    return NextResponse.json({
      auto,
      escalated: evalResult.escalateItems.length,
      rejected: evalResult.rejectedItems.length,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
