import { describe, it, expect } from "vitest";
import { APARTMENT_TEMPLATES, matchTemplate } from "@/lib/proposal/templates";

describe("apartment templates", () => {
  it("10~50평대 전 밴드 1개 이상 존재", () => {
    for (const band of [10, 20, 30, 40, 50]) {
      expect(APARTMENT_TEMPLATES.some((t) => t.pyeongBand === band)).toBe(true);
    }
  });
  it("모든 템플릿: rooms 비어있지 않고 furniture assetId 존재", () => {
    for (const t of APARTMENT_TEMPLATES) {
      expect(t.rooms.length).toBeGreaterThan(0);
      expect(t.exclusiveM2).toBeGreaterThan(0);
    }
  });
  it("25평/방3/욕2 → 20평대 3룸 템플릿 매칭", () => {
    const t = matchTemplate({ pyeong: 25, bedrooms: 3, bathrooms: 2 });
    expect(t.pyeongBand).toBe(20);
    expect(t.bedrooms).toBe(3);
  });
  it("47평 → 50평대 최근접 밴드로 매칭", () => {
    expect(matchTemplate({ pyeong: 47, bedrooms: 4, bathrooms: 2 }).pyeongBand).toBe(50);
  });
  it("범위 밖(5평) → 최소 밴드(10)로 폴백", () => {
    expect(matchTemplate({ pyeong: 5, bedrooms: 1, bathrooms: 1 }).pyeongBand).toBe(10);
  });
});
