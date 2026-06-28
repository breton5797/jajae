import { describe, it, expect } from "vitest";
import { toFurnishedScene } from "@/lib/studio/from-floorplan";
import { APARTMENT_TEMPLATES } from "@/lib/proposal/templates";
import type { FinishSelection } from "@/lib/types";

const T = APARTMENT_TEMPLATES.find((x) => x.pyeongBand === 20)!;
const finishes: FinishSelection[] = [
  { category: "flooring", qty: 50, lineTotal: 0, downgraded: false,
    material: { id: "f", category: "flooring", tier: "standard", brandId: "b", label: "오크", unitPrice: 0, priceStatus: "estimated", color: "#B98C5A" } },
  { category: "paint", qty: 100, lineTotal: 0, downgraded: false,
    material: { id: "p", category: "paint", tier: "standard", brandId: "b", label: "그레이", unitPrice: 0, priceStatus: "estimated", color: "#E6E3DC" } },
];

describe("toFurnishedScene", () => {
  it("flooring/paint 색을 floorColor/wallColor로 매핑", () => {
    const s = toFurnishedScene(T, finishes);
    expect(s.floorColor).toBe("#B98C5A");
    expect(s.wallColor).toBe("#E6E3DC");
  });
  it("템플릿 가구 assetId를 ASSETS로 해석 (알 수 없는 id 제외)", () => {
    const s = toFurnishedScene(T, finishes);
    expect(s.furniture.length).toBe(T.furniture.length); // 모두 유효 id(sofa/table/bed)
    expect(s.furniture[0]!.asset.id).toBeTruthy();
  });
  it("rooms·치수 그대로 전달", () => {
    const s = toFurnishedScene(T, finishes);
    expect(s.rooms.length).toBe(T.rooms.length);
    expect(s.widthM).toBeGreaterThan(0);
  });
  it("finishes 없으면 기본색 폴백", () => {
    const s = toFurnishedScene(T, []);
    expect(s.floorColor).toMatch(/^#/);
    expect(s.wallColor).toMatch(/^#/);
  });
});
