import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceSupabase } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { classifyAsRequestWithAI } from "@/lib/triage/as-anthropic";
import { classifyAsRequestFallback, decideAsTriage } from "@/lib/triage/as";
import type { AsTriagePolicy } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PendingRow {
  id: string;
  issue: string;
  order_items: { name_snapshot: string } | null;
}

export async function POST() {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    const sb = createServiceSupabase();
    const { data: policyRow } = await sb
      .from("as_triage_policies")
      .select("*")
      .eq("singleton", true)
      .maybeSingle();
    const policy = policyRow as AsTriagePolicy | null;
    if (!policy) {
      return NextResponse.json({ error: "AS 트리아지 정책이 없습니다." }, { status: 422 });
    }

    const { data: rows } = await sb
      .from("as_requests")
      .select("id, issue, order_items(name_snapshot)")
      .eq("status", "requested");
    const pending = (rows ?? []) as unknown as PendingRow[];

    let scheduled = 0;
    let escalated = 0;
    for (const r of pending) {
      const { count } = await sb
        .from("as_triage_decisions")
        .select("id", { count: "exact", head: true })
        .eq("as_request_id", r.id);
      if ((count ?? 0) > 0) continue;

      const cls =
        (await classifyAsRequestWithAI({
          issue: r.issue,
          productName: r.order_items?.name_snapshot ?? "",
        })) ?? classifyAsRequestFallback(r.issue);

      const evald = decideAsTriage(cls, policy);
      const proposed = evald.outcome === "auto_schedule" ? "schedule" : "escalate";

      const { data: outcome, error } = await sb.rpc("as_triage_auto_resolve", {
        p_as_request_id: r.id,
        p_proposed_decision: proposed,
        p_responsibility: cls.responsibility,
        p_confidence: cls.confidence,
        p_rationale: cls.rationale,
      });
      if (error) {
        console.error("as_triage_auto_resolve error:", error);
        continue;
      }
      if (outcome === "schedule") scheduled += 1;
      else escalated += 1;
    }
    return NextResponse.json({ scheduled, escalated, processed: scheduled + escalated });
  } catch (e) {
    console.error("as-triage run failed:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

const PolicySchema = z
  .object({
    enabled: z.boolean().optional(),
    min_confidence: z.number().min(0).max(1).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "no fields" });

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
      .from("as_triage_policies")
      .update(parsed.data)
      .eq("singleton", true);
    if (error) {
      return NextResponse.json({ error: "정책 저장에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ status: "saved" });
  } catch (e) {
    console.error("as-triage policy update failed:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
