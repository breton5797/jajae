/**
 * Deterministic BOM (자재 물량 산출) estimator. Used as the offline fallback and
 * as ground truth in tests. Given a project + area + spec level, it produces an
 * itemized material list across finishing AND structural categories.
 *
 * Numbers are MVP heuristics, not engineering specs.
 */
import type {
  BomInput,
  BomLine,
  BomResult,
  ProductUnit,
  SpecLevel,
} from "@/lib/types";
import { won } from "@/lib/utils";

const PYEONG_TO_M2 = 3.3058;

const SPEC_MULTIPLIER: Record<SpecLevel, number> = {
  economy: 0.8,
  standard: 1.0,
  premium: 1.6,
};

interface Rule {
  category: string;
  categorySlug: string;
  item: string;
  unit: ProductUnit;
  /** quantity given floor area (m2) and dimensions */
  qty: (floorM2: number, input: BomInput) => number;
  /** base unit price (standard spec) in KRW */
  basePrice: number;
}

const bathroomCount = (i: BomInput) => i.dimensions?.bathroomCount ?? 1;

const RULES: Record<BomInput["projectType"], Rule[]> = {
  apartment_remodel: [
    { category: "바닥재", categorySlug: "flooring", item: "강마루", unit: "m2", qty: (m2) => Math.ceil(m2 * 1.05), basePrice: 38000 },
    { category: "벽지/도배", categorySlug: "wallpaper", item: "실크벽지", unit: "roll", qty: (m2) => Math.ceil((m2 * 2.6) / 5), basePrice: 22000 },
    { category: "페인트", categorySlug: "paint", item: "친환경 수성페인트", unit: "can", qty: (m2) => Math.ceil(m2 / 33), basePrice: 45000 },
    { category: "타일", categorySlug: "tile", item: "욕실 자기질 타일", unit: "m2", qty: (_m2, i) => Math.ceil(bathroomCount(i) * 26 * 1.08), basePrice: 31000 },
    { category: "위생도기", categorySlug: "sanitaryware", item: "양변기 세트", unit: "ea", qty: (_m2, i) => bathroomCount(i), basePrice: 180000 },
    { category: "조명", categorySlug: "lighting", item: "LED 평판등", unit: "ea", qty: (m2) => Math.ceil(m2 / 3.3), basePrice: 28000 },
    { category: "석고보드", categorySlug: "gypsum-board", item: "석고보드 9.5T", unit: "sheet", qty: (m2) => Math.ceil((m2 * 1.4) / 2.88), basePrice: 6500 },
    { category: "단열재", categorySlug: "insulation", item: "압출법 단열재 50T", unit: "sheet", qty: (m2) => Math.ceil(m2 / 1.2), basePrice: 9800 },
    { category: "방수", categorySlug: "waterproofing", item: "욕실 방수액", unit: "can", qty: (_m2, i) => bathroomCount(i) * 2, basePrice: 42000 },
  ],
  bathroom: [
    { category: "타일", categorySlug: "tile", item: "욕실 자기질 타일", unit: "m2", qty: (_m2, i) => Math.ceil(bathroomCount(i) * 28 * 1.08), basePrice: 31000 },
    { category: "위생도기", categorySlug: "sanitaryware", item: "양변기 세트", unit: "ea", qty: (_m2, i) => bathroomCount(i), basePrice: 180000 },
    { category: "위생도기", categorySlug: "sanitaryware", item: "세면대 세트", unit: "ea", qty: (_m2, i) => bathroomCount(i), basePrice: 120000 },
    { category: "방수", categorySlug: "waterproofing", item: "욕실 방수액", unit: "can", qty: (_m2, i) => bathroomCount(i) * 2, basePrice: 42000 },
    { category: "조명", categorySlug: "lighting", item: "방습 LED 등", unit: "ea", qty: (_m2, i) => bathroomCount(i), basePrice: 35000 },
  ],
  kitchen: [
    { category: "주방/가구", categorySlug: "kitchen", item: "싱크대 상하부장 세트", unit: "ea", qty: () => 1, basePrice: 1500000 },
    { category: "타일", categorySlug: "tile", item: "주방 벽 타일", unit: "m2", qty: (m2) => Math.ceil(Math.min(m2, 8) * 1.08), basePrice: 26000 },
    { category: "조명", categorySlug: "lighting", item: "주방 LED 등", unit: "ea", qty: (m2) => Math.ceil(m2 / 4), basePrice: 30000 },
    { category: "바닥재", categorySlug: "flooring", item: "주방 강마루", unit: "m2", qty: (m2) => Math.ceil(m2 * 1.05), basePrice: 38000 },
  ],
  commercial_interior: [
    { category: "바닥재", categorySlug: "flooring", item: "데코타일", unit: "m2", qty: (m2) => Math.ceil(m2 * 1.07), basePrice: 21000 },
    { category: "페인트", categorySlug: "paint", item: "수성페인트", unit: "can", qty: (m2) => Math.ceil(m2 / 30), basePrice: 42000 },
    { category: "석고보드", categorySlug: "gypsum-board", item: "석고보드 9.5T", unit: "sheet", qty: (m2) => Math.ceil((m2 * 1.6) / 2.88), basePrice: 6500 },
    { category: "경량/철물", categorySlug: "hardware", item: "경량 스터드 65", unit: "ea", qty: (m2) => Math.ceil(m2 * 0.9), basePrice: 4800 },
    { category: "조명", categorySlug: "lighting", item: "LED 평판등", unit: "ea", qty: (m2) => Math.ceil(m2 / 3), basePrice: 28000 },
    { category: "단열재", categorySlug: "insulation", item: "글라스울 50T", unit: "roll", qty: (m2) => Math.ceil(m2 / 10), basePrice: 32000 },
  ],
  new_build: [
    { category: "시멘트", categorySlug: "cement", item: "포틀랜드 시멘트 40kg", unit: "bag", qty: (m2) => Math.ceil(m2 * 1.2), basePrice: 7800 },
    { category: "철근", categorySlug: "rebar", item: "이형철근 D13", unit: "ton", qty: (m2) => Math.max(1, Math.ceil(m2 * 0.02)), basePrice: 950000 },
    { category: "단열재", categorySlug: "insulation", item: "압출법 단열재 100T", unit: "sheet", qty: (m2) => Math.ceil(m2 / 1.0), basePrice: 16800 },
    { category: "방수", categorySlug: "waterproofing", item: "방수시트", unit: "roll", qty: (m2) => Math.ceil(m2 / 20), basePrice: 68000 },
    { category: "석고보드", categorySlug: "gypsum-board", item: "석고보드 12.5T", unit: "sheet", qty: (m2) => Math.ceil((m2 * 1.5) / 2.88), basePrice: 7800 },
    { category: "목재", categorySlug: "lumber", item: "구조용 각재", unit: "ea", qty: (m2) => Math.ceil(m2 * 0.6), basePrice: 5200 },
  ],
};

export function generateBomDeterministic(input: BomInput): BomResult {
  const floorM2 = input.areaPyeong * PYEONG_TO_M2;
  const mult = SPEC_MULTIPLIER[input.specLevel];
  const rules = RULES[input.projectType] ?? RULES.apartment_remodel;

  const lines: BomLine[] = rules.map((r) => {
    const qty = Math.max(1, r.qty(floorM2, input));
    const estUnitPrice = won(r.basePrice * mult);
    return {
      category: r.category,
      categorySlug: r.categorySlug,
      item: r.item,
      qty,
      unit: r.unit,
      estUnitPrice,
      estPrice: won(estUnitPrice * qty),
    };
  });

  const estTotal = lines.reduce((s, l) => s + l.estPrice, 0);
  return { lines, estTotal, source: "fallback" };
}
