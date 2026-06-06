import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { buildCategoryTree } from "@/lib/catalog";
import type { Category, CategoryNode, Product } from "@/lib/types";

/** Load all categories as a tree. Returns [] if the backend is unavailable. */
export async function loadCategoryTree(): Promise<CategoryNode[]> {
  try {
    const sb = createServerSupabase();
    const { data } = await sb.from("categories").select("*");
    return buildCategoryTree((data ?? []) as Category[]);
  } catch {
    return [];
  }
}

export async function loadCategories(): Promise<Category[]> {
  try {
    const sb = createServerSupabase();
    const { data } = await sb.from("categories").select("*");
    return (data ?? []) as Category[];
  } catch {
    return [];
  }
}

export interface CatalogQuery {
  categoryId?: string;
  q?: string;
  brand?: string;
}

export async function loadProducts(query: CatalogQuery = {}): Promise<Product[]> {
  try {
    const sb = createServerSupabase();
    let q = sb.from("products").select("*").eq("status", "approved");
    if (query.categoryId) q = q.eq("category_id", query.categoryId);
    if (query.brand) q = q.eq("brand", query.brand);
    if (query.q) q = q.textSearch("search", query.q, { type: "websearch" });
    const { data } = await q.order("unit_price", { ascending: true }).limit(60);
    return (data ?? []) as Product[];
  } catch {
    return [];
  }
}

/** supplier_id → public composite rating (suppliers.rating) for catalog badges. */
export async function loadSupplierRatingMap(): Promise<Map<string, number>> {
  try {
    const sb = createServerSupabase();
    const { data } = await sb.from("suppliers").select("id, rating");
    return new Map(
      ((data ?? []) as Array<{ id: string; rating: number }>).map((s) => [
        s.id,
        Number(s.rating),
      ]),
    );
  } catch {
    return new Map();
  }
}

export async function loadProduct(id: string): Promise<Product | null> {
  try {
    const sb = createServerSupabase();
    const { data } = await sb
      .from("products")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return (data as Product) ?? null;
  } catch {
    return null;
  }
}
