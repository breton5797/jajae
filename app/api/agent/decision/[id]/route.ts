import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import type { AgentDecision, PlanItem } from "@/lib/types";

export const dynamic = "force-dynamic";

const Schema = z.object({ action: z.enum(["approve", "reject"]) });

/** Human-in-the-loop: approve (execute) or reject an escalated agent decision. */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const { data: decRow } = await sb
      .from("agent_decisions")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (!decRow) return NextResponse.json({ error: "결정을 찾을 수 없습니다." }, { status: 404 });
    const decision = decRow as AgentDecision;

    if (parsed.data.action === "reject") {
      await sb.from("agent_decisions").update({ status: "rejected" }).eq("id", params.id);
      await sb.from("agent_audit_log").insert({
        contractor_id: user.id,
        decision_id: params.id,
        action: "reject",
        amount: 0,
      });
      return NextResponse.json({ status: "rejected" });
    }

    // approve → mark approved, then execute the PO (bypasses auto gate since status != auto_executed)
    const item = decision.plan as unknown as PlanItem;
    await sb.from("agent_decisions").update({ status: "approved" }).eq("id", params.id);

    const { data: order } = await sb
      .from("orders")
      .insert({
        contractor_id: user.id,
        payment_method: "escrow",
        status: "pending",
        subtotal: item.amount,
        total: item.amount,
      })
      .select("id")
      .single();
    if (!order) return NextResponse.json({ error: "주문 생성 실패" }, { status: 500 });
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
    if (po) {
      await sb.from("agent_actions").insert({
        decision_id: params.id,
        po_id: po.id,
        reversible_until: new Date(Date.now() + 86_400_000).toISOString(),
      });
    }
    await sb.from("agent_audit_log").insert({
      contractor_id: user.id,
      decision_id: params.id,
      action: "approve_execute",
      amount: item.amount,
    });

    return NextResponse.json({ status: "approved", poId: po?.id ?? null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
