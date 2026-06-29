import { describe, it, expect } from "vitest";
import { priceYeongnimColor, applyYeongnimToFinishes, catalogQty } from "@/lib/proposal/apply-yeongnim";
import { materialsTotal } from "@/lib/proposal/materials";
import { APARTMENT_TEMPLATES } from "@/lib/proposal/templates";
import type { FinishSelection } from "@/lib/types";
import type { YeongnimColor } from "@/lib/proposal/yeongnim";

const T = APARTMENT_TEMPLATES.find((x) => x.pyeongBand === 20)!; // 3룸 2욕

const color: YeongnimColor = {
  series: "루나 라이트스톤",
  patternGroup: "스톤마블",
  color: "#D8D6D0",
  items: [
    { category: "flooring", modelCode: "YMQ(W)-304", unitPrice: 75000 },
    { category: "kitchen", modelCode: "LU-02", unitPrice: 3400000 },
    { category: "furniture", modelCode: "LU-02", unitPrice: 920000 },
    { category: "film", modelCode: "PX451-1", unitPrice: 14000 },
    { category: "wallpanel", modelCode: "WSB-250", unitPrice: 60000 },
  ],
};

describe("priceYeongnimColor", () => {
  it("카테고리별 수량×단가, 소계는 예산 카테고리만 합산", () => {
    const { items, subtotal } = priceYeongnimColor(color, T);
    const fl = items.find((i) => i.category === "flooring")!;
    expect(fl.qty).toBeGreaterThan(0);
    expect(fl.lineTotal).toBe(fl.qty * 75000);
    // film/wallpanel 도 수량>0 (벽면적 기반)
    expect(items.find((i) => i.category === "film")!.qty).toBeGreaterThan(0);
    // subtotal = flooring + kitchen + furniture (film/wallpanel 제외)
    const expected = ["flooring", "kitchen", "furniture"]
      .map((c) => items.find((i) => i.category === c)!.lineTotal)
      .reduce((a, b) => a + b, 0);
    expect(subtotal).toBe(expected);
  });
});

describe("applyYeongnimToFinishes", () => {
  const base: FinishSelection[] = [
    { category: "flooring", qty: 50, lineTotal: 3100000, downgraded: false,
      material: { id: "f", category: "flooring", tier: "standard", brandId: "b", label: "오크", unitPrice: 62000, priceStatus: "estimated" } },
    { category: "tile", qty: 24, lineTotal: 912000, downgraded: false,
      material: { id: "t", category: "tile", tier: "standard", brandId: "b", label: "타일", unitPrice: 38000, priceStatus: "estimated" } },
  ];

  it("겹치는 카테고리(flooring)는 영림으로 교체, 비겹침(tile)은 유지", () => {
    const out = applyYeongnimToFinishes(base, color, T);
    const fl = out.find((s) => s.category === "flooring")!;
    expect(fl.material.brandName).toBe("영림");
    expect(fl.material.label).toContain("루나 라이트스톤");
    const tile = out.find((s) => s.category === "tile")!;
    expect(tile.material.brandName).toBeUndefined(); // 그대로
  });

  it("영림에만 있는 카테고리(kitchen/furniture)는 추가", () => {
    const out = applyYeongnimToFinishes(base, color, T);
    expect(out.find((s) => s.category === "kitchen")?.material.brandName).toBe("영림");
    expect(out.find((s) => s.category === "furniture")?.material.brandName).toBe("영림");
    // 총 자재비는 base보다 증가(키친/수납 추가)
    expect(materialsTotal(out)).toBeGreaterThan(materialsTotal(base));
  });
});

describe("catalogQty", () => {
  it("film/wallpanel은 벽면적 기반 수량", () => {
    expect(catalogQty("film", T)).toBeGreaterThan(0);
    expect(catalogQty("wallpanel", T)).toBeGreaterThan(0);
    expect(catalogQty("door", T)).toBe(5); // 침실3+욕실2
  });
});
