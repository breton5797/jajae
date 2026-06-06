import { NextResponse } from "next/server";
import { z } from "zod";
import { applyJoin } from "@/lib/groupbuy";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";
import type { GroupBuy, GroupBuyJoin, GroupBuyTier } from "@/lib/types";

export const dynamic = "force-dynamic";

const Schema = z.object({ qty: z.number().int().positive() });

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
    return NextResponse.json({ error: "수량을 확인하세요." }, { status: 400 });

  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const { data: gb } = await sb
      .from("group_buys")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (!gb) return NextResponse.json({ error: "캠페인을 찾을 수 없습니다." }, { status: 404 });
    if ((gb as GroupBuy).status !== "open")
      return NextResponse.json({ error: "마감된 캠페인입니다." }, { status: 409 });

    // upsert this contractor's join (RLS: contractor_id = auth.uid())
    await sb
      .from("group_buy_joins")
      .upsert(
        { group_buy_id: params.id, contractor_id: user.id, qty: parsed.data.qty },
        { onConflict: "group_buy_id,contractor_id" },
      );

    // recompute aggregate + price (service updates campaign.joined_qty)
    const service = createServiceSupabase();
    const { data: joins } = await service
      .from("group_buy_joins")
      .select("contractor_id, qty")
      .eq("group_buy_id", params.id);
    const tiers = ((gb as GroupBuy).tiers ?? []) as GroupBuyTier[];
    let state = { joins: [] as { contractorId: string; qty: number }[], joinedQty: 0, unitPrice: 0, unlockedTier: null as GroupBuyTier | null };
    for (const j of (joins ?? []) as Pick<GroupBuyJoin, "contractor_id" | "qty">[]) {
      state = applyJoin(state.joins, j.contractor_id, Number(j.qty), tiers);
    }
    await service
      .from("group_buys")
      .update({ joined_qty: state.joinedQty })
      .eq("id", params.id);

    return NextResponse.json({
      joinedQty: state.joinedQty,
      currentPrice: state.unitPrice,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
