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
  it("템플릿 가구는 보존하고 빈 거주방은 가구로 채운다(enrich)", () => {
    const s = toFurnishedScene(T, finishes);
    // 템플릿 가구(유효 id) 이상으로 늘어난다
    expect(s.furniture.length).toBeGreaterThanOrEqual(T.furniture.length);
    expect(s.furniture[0]!.asset.id).toBeTruthy();
    // 모든 거주방(거실/방/주방)은 자기 영역 안에 가구가 1개 이상
    const habitable = T.rooms.filter((r) => r.type === "living" || r.type === "room" || r.type === "kitchen");
    for (const room of habitable) {
      const inside = s.furniture.some((f) => {
        const [x, , z] = f.transform.position;
        return x >= room.x && x <= room.x + room.w && z >= room.y && z <= room.y + room.h;
      });
      expect(inside, `${room.name} 가구 없음`).toBe(true);
    }
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
