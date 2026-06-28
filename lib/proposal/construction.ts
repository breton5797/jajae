// lib/proposal/construction.ts
/** BOM에서 마감재(자재 패널) 중복 제외한 공정/시공 합계 (순수). */
import type { BomResult } from "@/lib/types";

/** finish_materials 카테고리와 겹치는 BOM categorySlug — 중복 계상 방지. */
export const FINISH_SLUGS = new Set<string>([
  "flooring", "wallpaper", "paint", "tile", "window", "door",
  "kitchen", "sanitaryware", "lighting",
]);

export function constructionTotal(bom: BomResult): number {
  return bom.lines
    .filter((l) => !FINISH_SLUGS.has(l.categorySlug))
    .reduce((s, l) => s + l.estPrice, 0);
}
