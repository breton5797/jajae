import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const Schema = z.object({
  productId: z.string().uuid(),
  threshold: z.number().int().min(0),
  leadTimeDays: z.number().int().min(0),
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
    return NextResponse.json({ error: "재발주 규칙이 올바르지 않습니다." }, { status: 400 });

  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const { error } = await sb.from("reorder_rules").upsert(
      {
        contractor_id: user.id,
        product_id: parsed.data.productId,
        threshold: parsed.data.threshold,
        lead_time_days: parsed.data.leadTimeDays,
        enabled: true,
      },
      { onConflict: "contractor_id,product_id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
