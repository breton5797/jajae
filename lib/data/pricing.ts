import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { comparePrices, trendFromPriceHistory } from "@/lib/pricing";
import type {
  Category,
  PriceComparison,
  PriceHistory,
  PriceTrendPoint,
  Product,
} from "@/lib/types";

export async function loadPriceComparison(
  categoryId: string,
): Promise<PriceComparison> {
  try {
    const sb = createServerSupabase();
    const { data } = await sb
      .from("products")
      .select("*")
      .eq("category_id", categoryId)
      .eq("status", "approved");
    return comparePrices((data ?? []) as Product[], categoryId);
  } catch {
    return { categoryId, rows: [], min: 0, max: 0, median: 0, count: 0 };
  }
}

export async function loadPriceTrend(
  productId: string,
): Promise<PriceTrendPoint[]> {
  try {
    const sb = createServerSupabase();
    const { data } = await sb
      .from("price_history")
      .select("*")
      .eq("product_id", productId)
      .order("recorded_at", { ascending: true });
    return trendFromPriceHistory((data ?? []) as PriceHistory[]);
  } catch {
    return [];
  }
}

export async function loadComparableCategories(): Promise<Category[]> {
  try {
    const sb = createServerSupabase();
    const { data } = await sb
      .from("categories")
      .select("*")
      .is("parent_id", null)
      .order("sort");
    return (data ?? []) as Category[];
  } catch {
    return [];
  }
}
