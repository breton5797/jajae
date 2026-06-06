import { NextResponse } from "next/server";
import { z } from "zod";
import { buildPbProduct } from "@/lib/pb";
import { getAuthedUser } from "@/lib/auth";
import { createServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const Schema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  categoryId: z.string().uuid(),
  supplierId: z.string().uuid(),
  cost: z.number().positive(),
  marginRate: z.number().min(0).max(5),
  unit: z.string().optional(),
  stock: z.number().int().nonnegative().optional(),
  leadTimeDays: z.number().int().nonnegative().optional(),
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
  if (!parsed.success) {
    return NextResponse.json({ error: "PB 상품 정보가 올바르지 않습니다." }, { status: 400 });
  }

  try {
    const rows = buildPbProduct({
      ...parsed.data,
      unit: parsed.data.unit as never,
    });
    const sb = createServiceSupabase();
    const { data: product, error } = await sb
      .from("products")
      .insert(rows.product)
      .select("id")
      .single();
    if (error || !product) throw new Error(error?.message ?? "product insert failed");

    await sb
      .from("pb_products")
      .insert({ ...rows.pb, product_id: product.id });

    return NextResponse.json({ productId: product.id, sku: rows.pb.sku });
  } catch (e) {
    return NextResponse.json(
      { error: `PB 상품 생성 실패: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
