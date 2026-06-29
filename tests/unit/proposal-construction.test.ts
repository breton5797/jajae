import { describe, it, expect } from "vitest";
import { estimateConstruction } from "@/lib/proposal/construction";
import { APARTMENT_TEMPLATES } from "@/lib/proposal/templates";

const T20 = APARTMENT_TEMPLATES.find((x) => x.pyeongBand === 20)!; // 59㎡, 욕실 2

describe("estimateConstruction", () => {
  it("25평(59㎡) 표준 시공비는 현실적 규모(1500만~3500만)", () => {
    const e = estimateConstruction(T20, "standard");
    expect(e.total).toBeGreaterThan(15_000_000);
    expect(e.total).toBeLessThan(35_000_000);
    expect(e.lines.length).toBeGreaterThanOrEqual(5);
    // 합계 일관성
    expect(e.lines.reduce((s, l) => s + l.amount, 0)).toBe(e.total);
  });

  it("티어 스케일: 프리미엄 > 표준 > 실속", () => {
    const eco = estimateConstruction(T20, "economy").total;
    const std = estimateConstruction(T20, "standard").total;
    const pre = estimateConstruction(T20, "premium").total;
    expect(eco).toBeLessThan(std);
    expect(std).toBeLessThan(pre);
  });

  it("더 큰 평형/욕실 수 → 시공비 증가", () => {
    const t50 = APARTMENT_TEMPLATES.find((x) => x.pyeongBand === 50)!;
    expect(estimateConstruction(t50, "standard").total).toBeGreaterThan(
      estimateConstruction(T20, "standard").total,
    );
  });
});
