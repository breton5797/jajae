import { NextResponse } from "next/server";
import { comparePrices, trendFromPriceHistory } from "@/lib/pricing";
import { createServerSupabase } from "@/lib/supabase/server";
import type { PriceHistory, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const categoryId = url.searchParams.get("categoryId");
  const productId = url.searchParams.get("productId");

  try {
    const sb = createServerSupabase();
    const result: Record<string, unknown> = {};

    if (categoryId) {
      const { data } = await sb
        .from("products")
        .select("*")
        .eq("category_id", categoryId)
        .eq("status", "approved");
      result.comparison = comparePrices((data ?? []) as Product[], categoryId);
    }

    if (productId) {
      const { data } = await sb
        .from("price_history")
        .select("*")
        .eq("product_id", productId)
        .order("recorded_at", { ascending: true });
      result.trend = trendFromPriceHistory((data ?? []) as PriceHistory[]);
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ comparison: null, trend: [] });
  }
}
