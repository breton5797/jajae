import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceSupabase } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { classifyReturnWithAI } from "@/lib/triage/anthropic";
import { classifyReturnFallback, decideTriage } from "@/lib/triage";
import type { TriagePolicy } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PendingRow {
  id: string;
  qty: number;
  reason: string;
  order_items: { unit_price_snapshot: number; name_snapshot: string } | null;
}

/** POST: requested·미트리아지 반품을 일괄 자동 처리. DB가 최종 결정. */
export async function POST() {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    const sb = createServiceSupabase();
    const { data: policyRow } = await sb
      .from("triage_policies")
      .select("*")
      .eq("singleton", true)
      .maybeSingle();
    const policy = policyRow as TriagePolicy | null;
    if (!policy) {
      return NextResponse.json({ error: "트리아지 정책이 없습니다." }, { status: 422 });
    }

    const { data: rows } = await sb
      .from("returns")
      .select("id, qty, reason, order_items(unit_price_snapshot, name_snapshot)")
      .eq("status", "requested");
    const pending = (rows ?? []) as unknown as PendingRow[];

    let approved = 0;
    let escalated = 0;
    for (const r of pending) {
      const { count } = await sb
        .from("triage_decisions")
        .select("id", { count: "exact", head: true })
        .eq("return_id", r.id);
      if ((count ?? 0) > 0) continue; // 이미 트리아지됨

      const unit = r.order_items?.unit_price_snapshot ?? 0;
      const refund = r.qty * unit;
      const cls =
        (await classifyReturnWithAI({
          reason: r.reason,
          productName: r.order_items?.name_snapshot ?? "",
          qty: r.qty,
          refundAmount: refund,
        })) ?? classifyReturnFallback(r.reason, refund);

      // 서버 사전 평가(DB가 권위적으로 재검증). escalate면 proposed='escalate' 전달.
      const evald = decideTriage(cls, refund, policy);
      const proposed = evald.outcome === "auto_approve" ? "approve" : "escalate";

      const { data: outcome, error } = await sb.rpc("triage_auto_resolve_return", {
        p_return_id: r.id,
        p_proposed_decision: proposed,
        p_responsibility: cls.responsibility,
        p_confidence: cls.confidence,
        p_rationale: cls.rationale,
      });
      if (error) {
        console.error("triage_auto_resolve_return error:", error);
        continue;
      }
      if (outcome === "approve") approved += 1;
      else escalated += 1;
    }
    return NextResponse.json({ approved, escalated, processed: approved + escalated });
  } catch (e) {
    console.error("triage run failed:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

const PolicySchema = z
  .object({
    enabled: z.boolean().optional(),
    auto_approve_cap: z.number().nonnegative().optional(),
    min_confidence: z.number().min(0).max(1).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "no fields" });

/** PATCH: 트리아지 정책(상한·신뢰도·킬스위치) 수정. */
export async function PATCH(req: Request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    const parsed = PolicySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    const sb = createServiceSupabase();
    const { error } = await sb
      .from("triage_policies")
      .update(parsed.data)
      .eq("singleton", true);
    if (error) {
      return NextResponse.json({ error: "정책 저장에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ status: "saved" });
  } catch (e) {
    console.error("triage policy update failed:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
