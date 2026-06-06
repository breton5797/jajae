import { NextResponse } from "next/server";
import { z } from "zod";
import { buildMonthlySettlement, applyCreditCharge } from "@/lib/finance";
import { getAuthedUser } from "@/lib/auth";
import { createServiceSupabase } from "@/lib/supabase/server";
import type { CreditAccount } from "@/lib/types";

export const dynamic = "force-dynamic";

const Schema = z.object({
  contractorId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
});

export async function POST(req: Request) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "정산 요청이 올바르지 않습니다." }, { status: 400 });

  try {
    const sb = createServiceSupabase();
    const { data: orders } = await sb
      .from("orders")
      .select("id, subtotal, platform_fee, total")
      .eq("contractor_id", parsed.data.contractorId)
      .eq("status", "fulfilled");

    const settlement = buildMonthlySettlement(
      parsed.data.period,
      ((orders ?? []) as Array<{
        id: string;
        subtotal: number;
        platform_fee: number;
        total: number;
      }>).map((o) => ({
        id: o.id,
        subtotal: Number(o.subtotal),
        platform_fee: Number(o.platform_fee),
        total: Number(o.total),
      })),
    );

    const { data: row } = await sb
      .from("contractor_settlements")
      .upsert(
        {
          contractor_id: parsed.data.contractorId,
          period: settlement.period,
          gross: settlement.gross,
          fee: settlement.fee,
          net: settlement.net,
          status: "issued",
        },
        { onConflict: "contractor_id,period" },
      )
      .select("id")
      .single();

    // charge credit account if present
    const { data: account } = await sb
      .from("credit_accounts")
      .select("*")
      .eq("contractor_id", parsed.data.contractorId)
      .maybeSingle();
    if (account) {
      const charged = applyCreditCharge(account as CreditAccount, settlement.net);
      await sb
        .from("credit_accounts")
        .update({ used_amount: charged.used_amount })
        .eq("contractor_id", parsed.data.contractorId);
    }

    return NextResponse.json({ settlementId: row?.id, ...settlement });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
