import { NextResponse } from "next/server";
import { z } from "zod";
import {
  splitCartIntoPurchaseOrders,
  buildStagedDeliveries,
} from "@/lib/orders";
import {
  computeSettlement,
  canUseCredit,
  applyCreditUsage,
} from "@/lib/settlement";
import { confirmTossPayment } from "@/lib/payments/toss";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";
import { PLATFORM_FEE_RATE } from "@/lib/env";
import type { Product, Profile, ResolvedCartLine } from "@/lib/types";

export const dynamic = "force-dynamic";

const CheckoutSchema = z.object({
  siteId: z.string().uuid().nullable().optional(),
  paymentMethod: z.enum(["escrow", "credit"]),
  tossPaymentKey: z.string().optional(),
  lines: z
    .array(z.object({ productId: z.string().uuid(), qty: z.number().int().positive() }))
    .min(1),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const parsed = CheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "주문 정보가 올바르지 않습니다." },
      { status: 400 },
    );
  }
  const input = parsed.data;

  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { data: profile } = await sb
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile || (profile as Profile).biz_status !== "verified") {
      return NextResponse.json(
        { error: "사업자 인증이 필요합니다." },
        { status: 403 },
      );
    }

    const ids = input.lines.map((l) => l.productId);
    const { data: prodRows } = await sb
      .from("products")
      .select("*")
      .in("id", ids);
    const products = (prodRows ?? []) as Product[];
    const byId = new Map(products.map((p) => [p.id, p]));

    const resolved: ResolvedCartLine[] = [];
    for (const l of input.lines) {
      const product = byId.get(l.productId);
      if (!product) {
        return NextResponse.json(
          { error: `상품을 찾을 수 없습니다: ${l.productId}` },
          { status: 400 },
        );
      }
      resolved.push({ product, requestedQty: l.qty });
    }

    const orderDate = new Date().toISOString().slice(0, 10);
    const split = splitCartIntoPurchaseOrders(
      resolved,
      PLATFORM_FEE_RATE,
      orderDate,
    );
    const stages = buildStagedDeliveries(split, orderDate);

    // Credit-term gate
    const prof = profile as Profile;
    if (input.paymentMethod === "credit") {
      const credit = canUseCredit(prof, split.total);
      if (!credit.ok) {
        return NextResponse.json({ error: credit.error }, { status: 402 });
      }
    } else {
      const pay = await confirmTossPayment(
        {
          paymentKey: input.tossPaymentKey ?? `mock_${Date.now()}`,
          orderId: `order_${Date.now()}`,
          amount: split.total,
        },
        new Date().toISOString(),
      );
      if (!pay.ok) {
        return NextResponse.json({ error: pay.error }, { status: 402 });
      }
    }

    const paymentStatus =
      input.paymentMethod === "escrow" ? "held" : "pending";

    // Persist order graph (RLS allows the owning contractor).
    const { data: orderRow, error: orderErr } = await sb
      .from("orders")
      .insert({
        contractor_id: user.id,
        site_id: input.siteId ?? null,
        status: "paid",
        payment_method: input.paymentMethod,
        payment_status: paymentStatus,
        subtotal: split.subtotal,
        platform_fee: split.platformFee,
        total: split.total,
        toss_payment_key: input.tossPaymentKey ?? null,
      })
      .select("id")
      .single();
    if (orderErr || !orderRow) {
      return NextResponse.json(
        { error: "주문 생성에 실패했습니다." },
        { status: 500 },
      );
    }
    const orderId = orderRow.id as string;

    const service = createServiceSupabase();
    const poIdBySupplier = new Map<string, string>();

    for (const po of split.purchaseOrders) {
      const { data: poRow, error: poErr } = await sb
        .from("purchase_orders")
        .insert({
          order_id: orderId,
          supplier_id: po.supplierId,
          status: "pending",
          subtotal: po.subtotal,
          platform_fee: po.platformFee,
          expected_ship_date: po.expectedShipDate,
        })
        .select("id")
        .single();
      if (poErr || !poRow) throw new Error("PO 생성 실패");
      const poId = poRow.id as string;
      poIdBySupplier.set(po.supplierId, poId);

      await sb.from("order_items").insert(
        po.items.map((it) => ({
          po_id: poId,
          product_id: it.productId,
          name_snapshot: it.name,
          unit_price_snapshot: it.unitPrice,
          qty: it.qty,
          line_total: it.lineTotal,
          backordered: it.backordered,
        })),
      );

      const s = computeSettlement(po.subtotal, PLATFORM_FEE_RATE);
      await service.from("settlements").insert({
        po_id: poId,
        supplier_id: po.supplierId,
        gross: s.gross,
        platform_fee: s.platformFee,
        net: s.net,
        status: input.paymentMethod === "escrow" ? "held" : "pending",
      });
    }

    for (const stage of stages) {
      const poId = poIdBySupplier.get(stage.supplierId);
      if (!poId) continue;
      await sb.from("deliveries").insert({
        po_id: poId,
        site_id: input.siteId ?? null,
        status: "scheduled",
        scheduled_date: stage.scheduledDate,
      });
    }

    if (input.paymentMethod === "credit") {
      const next = applyCreditUsage(prof, split.total);
      await sb
        .from("profiles")
        .update({ credit_used: next.credit_used })
        .eq("id", user.id);
    }

    // Clear the user's server-side cart.
    await sb.from("cart_items").delete().eq("contractor_id", user.id);

    return NextResponse.json({
      orderId,
      poCount: split.purchaseOrders.length,
      total: split.total,
      hasBackorder: split.hasBackorder,
      stages: stages.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `주문 처리 중 오류: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
