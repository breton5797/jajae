import { describe, it, expect } from "vitest";
import { constructionTotal, FINISH_SLUGS } from "@/lib/proposal/construction";
import type { BomResult } from "@/lib/types";

const bom: BomResult = {
  source: "fallback", estTotal: 0,
  lines: [
    { category: "바닥재", categorySlug: "flooring", item: "마루", qty: 1, unit: "m2", estUnitPrice: 50000, estPrice: 50000 },
    { category: "철거", categorySlug: "demolition", item: "철거", qty: 1, unit: "ea", estUnitPrice: 800000, estPrice: 800000 },
    { category: "전기", categorySlug: "electrical", item: "배선", qty: 1, unit: "ea", estUnitPrice: 500000, estPrice: 500000 },
  ],
};

describe("constructionTotal", () => {
  it("마감 카테고리(flooring) 제외하고 공정만 합산", () => {
    expect(FINISH_SLUGS.has("flooring")).toBe(true);
    // 800000 + 500000 (flooring 50000 제외)
    expect(constructionTotal(bom)).toBe(1300000);
  });
});
