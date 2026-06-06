import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedUser } from "@/lib/auth";
import { createServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const Schema = z.object({
  productId: z.string().uuid(),
  supplierId: z.string().uuid(),
  title: z.string().min(1),
  endAt: z.string(),
  minQty: z.number().int().positive(),
  tiers: z
    .array(z.object({ minQty: z.number().int().positive(), unitPrice: z.number().positive() }))
    .min(1),
});

export async function POST(req: Request) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (user.role !== "admin" && user.role !== "supplier")
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "캠페인 정보가 올바르지 않습니다." }, { status: 400 });

  try {
    const sb = createServiceSupabase();
    const { data, error } = await sb
      .from("group_buys")
      .insert({
        product_id: parsed.data.productId,
        supplier_id: parsed.data.supplierId,
        title: parsed.data.title,
        end_at: parsed.data.endAt,
        min_qty: parsed.data.minQty,
        tiers: parsed.data.tiers,
        status: "open",
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "insert failed");
    return NextResponse.json({ id: data.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
