import { NextResponse } from "next/server";
import { generateBom, matchBomToProducts, BomInputSchema } from "@/lib/ai-quote";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Category, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const parsed = BomInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력값이 올바르지 않습니다.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const bom = await generateBom(parsed.data);

  try {
    const sb = createServerSupabase();
    const [{ data: cats }, { data: prods }] = await Promise.all([
      sb.from("categories").select("*"),
      sb.from("products").select("*").eq("status", "approved"),
    ]);
    const map = new Map(
      ((cats ?? []) as Category[]).map((c) => [c.slug, c.id]),
    );
    const matched = matchBomToProducts(bom, (prods ?? []) as Product[], map);
    return NextResponse.json(matched);
  } catch {
    return NextResponse.json(bom);
  }
}
