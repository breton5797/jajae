import { NextResponse } from "next/server";
import { planReorders, type ReorderSignal } from "@/lib/agent";
import { evaluatePlan } from "@/lib/policy";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadReorderOverview } from "@/lib/data/forecast";
import type { AgentPolicy, PlanItem, Product } from "@/lib/types";

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
    const evalResult = evaluatePlan(plan.items, policy);

    const reversibleUntil = new Date(Date.now() + 86_400_000).toISOString();
    let auto = 0;

    for (const item of evalResult.autoItems) {
      const poId = await executePo(sb, user.id, item);
      if (!poId) continue;
      const { data: dec } = await sb
        .from("agent_decisions")
        .insert({
          contractor_id: user.id,
          action: "reorder",
          rationale: item.rationale,
          status: "auto_executed",
          plan: item,
        })
        .select("id")
        .single();
      if (!dec) continue;
      // DB trigger enforce_agent_policy re-validates this insert.
      const { error } = await sb.from("agent_actions").insert({
        decision_id: dec.id,
        po_id: poId,
        reversible_until: reversibleUntil,
      });
      if (error) continue; // blocked by DB policy guard
      await sb.from("agent_audit_log").insert({
        contractor_id: user.id,
        decision_id: dec.id,
        action: "auto_po",
        amount: item.amount,
      });
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

async function executePo(
  sb: ReturnType<typeof createServerSupabase>,
  contractorId: string,
  item: PlanItem,
): Promise<string | null> {
  const { data: order } = await sb
    .from("orders")
    .insert({
      contractor_id: contractorId,
      payment_method: "escrow",
      status: "pending",
      subtotal: item.amount,
      total: item.amount,
    })
    .select("id")
    .single();
  if (!order) return null;
  const { data: po } = await sb
    .from("purchase_orders")
    .insert({
      order_id: order.id,
      supplier_id: item.supplierId,
      status: "pending",
      subtotal: item.amount,
    })
    .select("id")
    .single();
  return po?.id ?? null;
}
