// lib/data/finish-materials.ts
import { createServerSupabase } from "@/lib/supabase/server";
import type { FinishMaterial } from "@/lib/types";

interface Row {
  id: string; category: string; tier: string; brand_id: string;
  label: string; unit_price: number; price_status: string;
  color: string | null; swatch_url: string | null; spec: string | null;
  material_brands: { name: string } | null;
}

export async function fetchFinishCatalog(): Promise<FinishMaterial[]> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("finish_materials")
    .select("id,category,tier,brand_id,label,unit_price,price_status,color,swatch_url,spec,material_brands(name)")
    .order("category");
  if (error || !data) return [];
  return (data as unknown as Row[]).map((r) => ({
    id: r.id,
    category: r.category as FinishMaterial["category"],
    tier: r.tier as FinishMaterial["tier"],
    brandId: r.brand_id,
    brandName: r.material_brands?.name,
    label: r.label,
    unitPrice: Number(r.unit_price),
    priceStatus: r.price_status as FinishMaterial["priceStatus"],
    color: r.color ?? undefined,
    swatchUrl: r.swatch_url ?? undefined,
    spec: r.spec ?? undefined,
  }));
}
