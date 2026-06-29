/**
 * lib/proposal/yeongnim.ts
 * 영림 카탈로그(material_catalog_items) 행 → 컬러별 카테고리 매치 그룹핑 (순수·결정론).
 * "영림 토탈 인테리어 컬러 매치" — 한 컬러를 도어/키친/마루/필름 등에 통일 적용.
 */

export interface YeongnimItem {
  category: string;
  modelCode: string;
}
export interface YeongnimColor {
  series: string;
  patternGroup: string;
  items: YeongnimItem[];
}
export interface YeongnimRow {
  series: string;
  patternGroup: string | null;
  category: string;
  modelCode: string;
}

/** 컬러 매치 표시 대상 카테고리 + 정렬 순서(창호 제외 — 인테리어 마감만). */
export const MATCH_CATEGORIES = [
  "flooring", "door", "kitchen", "furniture", "film", "wallpanel",
] as const;

const GROUP_ORDER = ["스톤마블", "우드", "솔리드", "레더", "결"];

const catRank = (c: string) => {
  const i = (MATCH_CATEGORIES as readonly string[]).indexOf(c);
  return i === -1 ? MATCH_CATEGORIES.length : i;
};
const groupRank = (g: string) => {
  const i = GROUP_ORDER.indexOf(g);
  return i === -1 ? GROUP_ORDER.length : i;
};

/** 카탈로그 행 → 컬러별 그룹(카테고리 정렬, 컬러는 패턴그룹→이름 정렬). */
export function groupYeongnimColors(rows: YeongnimRow[]): YeongnimColor[] {
  const bySeries = new Map<string, YeongnimColor>();
  for (const r of rows) {
    if (!(MATCH_CATEGORIES as readonly string[]).includes(r.category)) continue;
    let color = bySeries.get(r.series);
    if (!color) {
      color = { series: r.series, patternGroup: r.patternGroup ?? "기타", items: [] };
      bySeries.set(r.series, color);
    }
    if (!color.items.some((it) => it.category === r.category)) {
      color.items.push({ category: r.category, modelCode: r.modelCode });
    }
  }
  const colors = Array.from(bySeries.values());
  for (const c of colors) {
    c.items.sort((a, b) => catRank(a.category) - catRank(b.category));
  }
  colors.sort((a, b) => {
    const g = groupRank(a.patternGroup) - groupRank(b.patternGroup);
    return g !== 0 ? g : a.series.localeCompare(b.series, "ko");
  });
  return colors;
}
