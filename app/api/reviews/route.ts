import { NextResponse } from "next/server";
import { z } from "zod";
import { validateReview } from "@/lib/community";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const Schema = z.object({
  productId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  body: z.string(),
  photos: z.array(z.string()).optional(),
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
    return NextResponse.json({ error: "리뷰 정보가 올바르지 않습니다." }, { status: 400 });

  const check = validateReview({ rating: parsed.data.rating, body: parsed.data.body });
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 422 });

  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const { error } = await sb.from("reviews").upsert(
      {
        product_id: parsed.data.productId,
        contractor_id: user.id,
        rating: parsed.data.rating,
        body: parsed.data.body,
        photos: parsed.data.photos ?? [],
      },
      { onConflict: "product_id,contractor_id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
