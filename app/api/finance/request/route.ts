import { NextResponse } from "next/server";
import { z } from "zod";
import { computeCreditScore, scoreToFinanceOffer } from "@/lib/scoring";
import {
  computeEarlyPayout,
  canRequestFinance,
  financeOutstanding,
} from "@/lib/finance";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";
import type { CreditScore, FinanceRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

const Schema = z.object({
  type: z.enum(["early_settlement", "purchase_financing"]),
  amount: z.number().positive(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "금융 요청이 올바르지 않습니다." }, { status: 400 });

  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    // resolve score (stored, else cold-start)
    const { data: scoreRow } = await sb
      .from("credit_scores")
      .select("*")
      .eq("contractor_id", user.id)
      .maybeSingle();
    const score = scoreRow
      ? {
          score: (scoreRow as CreditScore).score,
          grade: (scoreRow as CreditScore).grade as never,
          factors: [],
          coldStart: false,
        }
      : computeCreditScore({
          orderCount: 0,
          gmv: 0,
          onTimeSettlementRate: 0,
          returnRate: 0,
          tenureMonths: 0,
        });
    const offer = scoreToFinanceOffer(score);

    // current outstanding across active finance requests
    const { data: active } = await sb
      .from("finance_requests")
      .select("amount, fee, status")
      .eq("contractor_id", user.id)
      .in("status", ["disbursed", "repaying", "overdue"]);
    const outstanding = ((active ?? []) as FinanceRequest[]).reduce(
      (s, r) => s + financeOutstanding(Number(r.amount), Number(r.fee), []),
      0,
    );

    const gate = canRequestFinance(parsed.data.amount, {
      limit: offer.limit,
      outstanding,
      overdue: false,
      eligible: offer.eligible,
    });
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 402 });

    const payout = computeEarlyPayout(parsed.data.amount, offer.rate);
    const { data: created, error } = await sb
      .from("finance_requests")
      .insert({
        contractor_id: user.id,
        type: parsed.data.type,
        amount: payout.receivable,
        fee: payout.fee,
        rate: payout.rate,
        status: "requested",
      })
      .select("id")
      .single();
    if (error || !created)
      return NextResponse.json({ error: "요청 생성 실패" }, { status: 500 });

    // immutable audit trail (service writes; contractor scoped on read)
    const service = createServiceSupabase();
    await service.from("finance_audit_log").insert({
      actor_id: user.id,
      contractor_id: user.id,
      action: "finance_request",
      amount: payout.advance,
      ref_id: created.id,
      detail: { type: parsed.data.type, grade: score.grade },
    });

    return NextResponse.json({
      id: created.id,
      advance: payout.advance,
      fee: payout.fee,
      rate: payout.rate,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
