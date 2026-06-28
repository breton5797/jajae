import { NextResponse } from "next/server";
import { EstimateInputSchema } from "@/lib/estimate/schema";
import { buildEstimate } from "@/lib/estimate";
import { createServerSupabase } from "@/lib/supabase/server";
import { getAuthedUser } from "@/lib/auth";
import type { Category, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const parsed = EstimateInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력값이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { brief, customerName } = parsed.data;
  const rawBody = body as Record<string, unknown>;
  const transcript =
    typeof rawBody.transcript === "string" ? rawBody.transcript : "";

  const sb = createServerSupabase();
  const [{ data: cats }, { data: prods }] = await Promise.all([
    sb.from("categories").select("*"),
    sb.from("products").select("*").eq("status", "approved"),
  ]);

  const catalog = {
    categories: (cats ?? []) as Category[],
    products: (prods ?? []) as Product[],
  };

  const estimate = await buildEstimate(brief, catalog).catch((): null => null);
  if (!estimate) {
    return NextResponse.json(
      { error: "견적 생성에 실패했습니다." },
      { status: 422 },
    );
  }

  const { data: inserted, error: insertError } = await sb
    .from("interior_estimates")
    .insert({
      contractor_id: user.id,
      customer_name: customerName ?? null,
      transcript,
      brief,
      floor_plan: estimate.floorPlan,
      bom: estimate.bom,
      total_krw: estimate.totalKRW,
      status: "draft",
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({
    id: inserted.id,
    floorPlan: estimate.floorPlan,
    bom: estimate.bom,
    totalKRW: estimate.totalKRW,
  });
}
