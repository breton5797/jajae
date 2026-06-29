import { describe, it, expect } from "vitest";
import { selectFinishes, materialsTotal } from "@/lib/proposal/materials";
import type { ApartmentTemplate, EstimateBrief, FinishMaterial } from "@/lib/types";

const T: ApartmentTemplate = {
  id: "t", pyeongBand: 20, exclusiveM2: 59, supplyM2: 82, bedrooms: 2, bathrooms: 1,
  rooms: [{ name: "거실", type: "living", x: 0, y: 0, w: 2, h: 1 }], furniture: [],
};
// 단순 카탈로그: door 카테고리 1종, 3티어
const CATALOG: FinishMaterial[] = [
  { id: "d-e", category: "door", tier: "economy", brandId: "b", label: "이코", unitPrice: 100, priceStatus: "estimated" },
  { id: "d-s", category: "door", tier: "standard", brandId: "b", label: "스탠", unitPrice: 200, priceStatus: "estimated" },
  { id: "d-p", category: "door", tier: "premium", brandId: "b", label: "프리", unitPrice: 400, priceStatus: "estimated" },
];
const brief = (over: Partial<EstimateBrief>): EstimateBrief => ({
  projectType: "apartment_remodel", specLevel: "standard", rooms: T.rooms.map((r) => ({ name: r.name, type: r.type, widthM: r.w, lengthM: r.h })), ...over,
});

describe("selectFinishes", () => {
  it("specLevel standard → standard 티어 선택 (예산 없음)", () => {
    const sel = selectFinishes(brief({ specLevel: "standard" }), T, CATALOG);
    const door = sel.find((s) => s.category === "door")!;
    expect(door.material.tier).toBe("standard");
    expect(door.qty).toBe(3); // 침실2+욕실1
    expect(door.lineTotal).toBe(600); // 3*200
    expect(door.downgraded).toBe(false);
  });

  it("예산 부족 → economy로 강등 + downgraded 플래그", () => {
    // standard 600 > budget 350 → economy 300 으로 강등
    const sel = selectFinishes(brief({ specLevel: "standard", budgetKRW: 350 }), T, CATALOG);
    const door = sel.find((s) => s.category === "door")!;
    expect(door.material.tier).toBe("economy");
    expect(door.downgraded).toBe(true);
    expect(materialsTotal(sel)).toBeLessThanOrEqual(350);
  });

  it("premium 선호 + 충분 예산 → premium 유지", () => {
    const sel = selectFinishes(brief({ specLevel: "premium", budgetKRW: 10000 }), T, CATALOG);
    expect(sel.find((s) => s.category === "door")!.material.tier).toBe("premium");
  });

  it("budgetOverride가 brief.budgetKRW보다 우선한다(시공비 차감용)", () => {
    // brief 예산은 충분하지만 override 350 → 강등
    const sel = selectFinishes(
      brief({ specLevel: "standard", budgetKRW: 9_999_999 }),
      T, CATALOG, { budgetOverride: 350 },
    );
    expect(sel.find((s) => s.category === "door")!.material.tier).toBe("economy");
  });
});
