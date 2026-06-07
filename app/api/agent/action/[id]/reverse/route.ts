import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import type { AgentAction } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Reverse a reversible auto-PO within its window (cancels the PO). */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const { data: actRow } = await sb
      .from("agent_actions")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (!actRow) return NextResponse.json({ error: "액션을 찾을 수 없습니다." }, { status: 404 });
    const action = actRow as AgentAction;

    if (action.reversed) {
      return NextResponse.json({ error: "이미 취소된 액션입니다." }, { status: 409 });
    }
    if (new Date(action.reversible_until).getTime() < Date.now()) {
      return NextResponse.json({ error: "취소 가능 시간이 지났습니다." }, { status: 409 });
    }

    let reversedAmount = 0;
    if (action.po_id) {
      // block reversal if the order is already dispatched from a hub
      const { data: poRow } = await sb
        .from("purchase_orders")
        .select("order_id, subtotal")
        .eq("id", action.po_id)
        .maybeSingle();
      const po = poRow as { order_id: string; subtotal: number } | null;
      reversedAmount = Number(po?.subtotal ?? 0);
      const orderId = po?.order_id;
      if (orderId) {
        const { data: routes } = await sb
          .from("fulfillment_routes")
          .select("status")
          .eq("order_id", orderId)
          .eq("status", "dispatched");
        if ((routes ?? []).length > 0) {
          return NextResponse.json(
            { error: "이미 출고되어 취소할 수 없습니다." },
            { status: 409 },
          );
        }
      }
      await sb.from("purchase_orders").update({ status: "cancelled" }).eq("id", action.po_id);
    }
    await sb.from("agent_actions").update({ reversed: true }).eq("id", params.id);
    // Record the reversed amount so the server-side spend gate (sumNetAutoSpend)
    // frees the same room the DB trigger does — keeping both cap layers in sync.
    await sb.from("agent_audit_log").insert({
      contractor_id: user.id,
      decision_id: action.decision_id,
      action: "reversal",
      amount: reversedAmount,
    });

    return NextResponse.json({ reversed: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
