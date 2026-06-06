import { NextResponse } from "next/server";
import {
  analyzeDrawing,
  matchBomToProducts,
  DrawingAnalyzeSchema,
} from "@/lib/ai-quote";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Category, DrawingAnalysisInput, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const parsed = DrawingAnalyzeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력값이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  let analysis;
  try {
    analysis = await analyzeDrawing(parsed.data as DrawingAnalysisInput);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }

  try {
    const sb = createServerSupabase();
    const [{ data: cats }, { data: prods }] = await Promise.all([
      sb.from("categories").select("*"),
      sb.from("products").select("*").eq("status", "approved"),
    ]);
    const map = new Map(((cats ?? []) as Category[]).map((c) => [c.slug, c.id]));
    const matched = matchBomToProducts(
      analysis.bom,
      (prods ?? []) as Product[],
      map,
    );
    return NextResponse.json({ ...analysis, bom: matched });
  } catch {
    return NextResponse.json(analysis);
  }
}
