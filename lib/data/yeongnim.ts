// lib/data/yeongnim.ts — 영림 카탈로그 컬러 매치 조회(server).
import { createServerSupabase } from "@/lib/supabase/server";
import { groupYeongnimColors, type YeongnimColor } from "@/lib/proposal/yeongnim";

interface Row {
  series: string;
  model_code: string;
  category: string;
  pattern_group: string | null;
}

export async function fetchYeongnimColors(): Promise<YeongnimColor[]> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("material_catalog_items")
    .select("series, model_code, category, pattern_group, material_brands!inner(name)")
    .eq("material_brands.name", "영림");
  if (error || !data) return [];
  const rows = (data as unknown as Row[]).map((r) => ({
    series: r.series,
    patternGroup: r.pattern_group,
    category: r.category,
    modelCode: r.model_code,
  }));
  return groupYeongnimColors(rows);
}
