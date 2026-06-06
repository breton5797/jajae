import { NextResponse } from "next/server";
import { closeGroupBuy } from "@/lib/groupbuy";
import { getAuthedUser } from "@/lib/auth";
import { createServiceSupabase } from "@/lib/supabase/server";
import { PLATFORM_FEE_RATE } from "@/lib/env";
import { won } from "@/lib/utils";
import type { GroupBuy, GroupBuyJoin, GroupBuyTier } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (user.role !== "admin" && user.role !== "supplier")
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  try {
    const sb = createServiceSupabase();
    const { data: gb } = await sb
      .from("group_buys")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (!gb) return NextResponse.json({ error: "캠페인을 찾을 수 없습니다." }, { status: 404 });
    const campaign = gb as GroupBuy;

    const { data: joins } = await sb
      .from("group_buy_joins")
      .select("contractor_id, qty")
      .eq("group_buy_id", params.id);

    const result = closeGroupBuy(
      { minQty: campaign.min_qty, tiers: (campaign.tiers ?? []) as GroupBuyTier[] },
      ((joins ?? []) as Pick<GroupBuyJoin, "contractor_id" | "qty">[]).map((j) => ({
        contractorId: j.contractor_id,
        qty: Number(j.qty),
      })),
    );

    if (result.status === "cancelled") {
      await sb.from("group_buys").update({ status: "cancelled" }).eq("id", params.id);
      return NextResponse.json(result);
    }

    // convert into per-contractor orders (PO to the campaign supplier)
    for (const intent of result.orders) {
      const { data: order } = await sb
        .from("orders")
        .insert({
          contractor_id: intent.contractorId,
          status: "paid",
          payment_method: "escrow",
          payment_status: "held",
          subtotal: intent.amount,
          platform_fee: won(intent.amount * PLATFORM_FEE_RATE),
          total: intent.amount + won(intent.amount * PLATFORM_FEE_RATE),
        })
        .select("id")
        .single();
      if (!order) continue;
      const { data: po } = await sb
        .from("purchase_orders")
        .insert({
          order_id: order.id,
          supplier_id: campaign.supplier_id,
          status: "accepted",
          subtotal: intent.amount,
        })
        .select("id")
        .single();
      if (po) {
        await sb.from("order_items").insert({
          po_id: po.id,
          product_id: campaign.product_id,
          name_snapshot: campaign.title,
          unit_price_snapshot: intent.unitPrice,
          qty: intent.qty,
          line_total: intent.amount,
        });
      }
    }

    await sb
      .from("group_buys")
      .update({ status: "closed", final_unit_price: result.finalUnitPrice })
      .eq("id", params.id);

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
