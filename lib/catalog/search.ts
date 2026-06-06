/**
 * Product filtering, search, and natural-language → filter mapping. Pure.
 */
import type { Category, Product } from "@/lib/types";

export interface ProductFilter {
  /** restrict to these category ids (already expanded to include descendants) */
  categoryIds?: string[];
  brand?: string;
  supplierId?: string;
  /** spec key→value substring match, e.g. { 용도: "욕실" } */
  specs?: Record<string, string>;
  minPrice?: number;
  maxPrice?: number;
  /** free-text over name/brand/spec values */
  query?: string;
  /** default true: only approved products are publicly listable */
  onlyApproved?: boolean;
  inStockOnly?: boolean;
}

function matchesQuery(p: Product, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    p.name,
    p.brand,
    ...Object.values(p.spec).map((v) => String(v)),
  ]
    .join(" ")
    .toLowerCase();
  // AND over whitespace-separated terms (Gmail-style).
  return needle.split(/\s+/).every((term) => hay.includes(term));
}

export function filterProducts(
  products: Product[],
  filter: ProductFilter = {},
): Product[] {
  const onlyApproved = filter.onlyApproved ?? true;
  const catSet = filter.categoryIds ? new Set(filter.categoryIds) : null;

  return products.filter((p) => {
    if (onlyApproved && p.status !== "approved") return false;
    if (filter.inStockOnly && p.stock <= 0) return false;
    if (catSet && !catSet.has(p.category_id)) return false;
    if (filter.brand && p.brand !== filter.brand) return false;
    if (filter.supplierId && p.supplier_id !== filter.supplierId) return false;
    if (typeof filter.minPrice === "number" && p.unit_price < filter.minPrice)
      return false;
    if (typeof filter.maxPrice === "number" && p.unit_price > filter.maxPrice)
      return false;
    if (filter.specs) {
      for (const [k, v] of Object.entries(filter.specs)) {
        const sv = p.spec[k];
        if (sv === undefined) return false;
        if (!String(sv).toLowerCase().includes(v.toLowerCase())) return false;
      }
    }
    if (filter.query && !matchesQuery(p, filter.query)) return false;
    return true;
  });
}

/** Keyword → (categorySlug, spec hint) dictionary for NL search assist. */
const NL_KEYWORDS: Array<{
  match: RegExp;
  slug?: string;
  spec?: Record<string, string>;
}> = [
  { match: /바닥|마루|장판|플로어/, slug: "flooring" },
  { match: /벽지|도배|크로스/, slug: "wallpaper" },
  { match: /페인트|도료|칠/, slug: "paint" },
  { match: /타일/, slug: "tile" },
  { match: /변기|세면|양변기|위생/, slug: "sanitaryware" },
  { match: /조명|등|램프|라이트/, slug: "lighting" },
  { match: /단열/, slug: "insulation" },
  { match: /방수/, slug: "waterproofing", spec: { 기능: "방수" } },
  { match: /석고|보드/, slug: "gypsum-board" },
  { match: /시멘트|몰탈/, slug: "cement" },
  { match: /철근|봉강/, slug: "rebar" },
  { match: /목재|합판|각재|루버/, slug: "lumber" },
  { match: /철물|경량|스터드|하드웨어/, slug: "hardware" },
  { match: /주방|싱크|가구/, slug: "kitchen" },
  { match: /문|도어/, slug: "door" },
  { match: /창|샤시|새시|윈도우/, slug: "window" },
];

const NL_SPEC_HINTS: Array<{ match: RegExp; spec: Record<string, string> }> = [
  { match: /욕실|화장실/, spec: { 용도: "욕실" } },
  { match: /주방/, spec: { 용도: "주방" } },
  { match: /방수/, spec: { 기능: "방수" } },
  { match: /친환경|무독성/, spec: { 등급: "친환경" } },
  { match: /미끄럼|논슬립/, spec: { 기능: "논슬립" } },
];

/**
 * Map a natural-language need (e.g. "방수 잘되는 욕실 타일") to a ProductFilter.
 * Deterministic fallback for the AI search assist; safe to run offline.
 */
export function mapNaturalLanguageToFilter(
  query: string,
  categoryIdBySlug: Map<string, string>,
): ProductFilter {
  const categoryIds = new Set<string>();
  let specs: Record<string, string> = {};

  for (const rule of NL_KEYWORDS) {
    if (rule.match.test(query)) {
      if (rule.slug) {
        const id = categoryIdBySlug.get(rule.slug);
        if (id) categoryIds.add(id);
      }
      if (rule.spec) specs = { ...specs, ...rule.spec };
    }
  }
  for (const hint of NL_SPEC_HINTS) {
    if (hint.match.test(query)) specs = { ...specs, ...hint.spec };
  }

  const filter: ProductFilter = { query };
  if (categoryIds.size > 0) filter.categoryIds = [...categoryIds];
  if (Object.keys(specs).length > 0) filter.specs = specs;
  return filter;
}
