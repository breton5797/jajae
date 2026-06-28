import { describe, it, expect } from "vitest";
import { approxQuantity, floorAreaM2 } from "@/lib/proposal/quantities";
import type { ApartmentTemplate } from "@/lib/types";

const T: ApartmentTemplate = {
  id: "t", pyeongBand: 20, exclusiveM2: 59, supplyM2: 82, bedrooms: 3, bathrooms: 2,
  rooms: [
    { name: "거실", type: "living", x: 0, y: 0, w: 4, h: 5 },     // 20
    { name: "안방", type: "room", x: 4, y: 0, w: 3, h: 4 },       // 12
    { name: "침실1", type: "room", x: 4, y: 4, w: 3, h: 3 },      // 9
    { name: "침실2", type: "room", x: 0, y: 5, w: 3, h: 3 },      // 9
    { name: "욕실1", type: "bathroom", x: 7, y: 0, w: 2, h: 2 },  // 4
    { name: "욕실2", type: "bathroom", x: 7, y: 2, w: 2, h: 2 },  // 4
    { name: "발코니", type: "balcony", x: 0, y: 8, w: 7, h: 1.5 },// 10.5
  ],
  furniture: [],
};

describe("approxQuantity", () => {
  it("flooring: 발코니/욕실 제외 바닥면적", () => {
    // 거실20+안방12+침실9+침실9 = 50 (욕실·발코니 제외)
    expect(approxQuantity("flooring", T)).toEqual({ qty: 50, unit: "m2" });
  });
  it("door: 침실수+욕실수 = 5", () => {
    expect(approxQuantity("door", T)).toEqual({ qty: 5, unit: "ea" });
  });
  it("sanitaryware: 욕실수 = 2", () => {
    expect(approxQuantity("sanitaryware", T)).toEqual({ qty: 2, unit: "set" });
  });
  it("kitchen: 항상 1 세트", () => {
    expect(approxQuantity("kitchen", T).qty).toBe(1);
  });
  it("floorAreaM2 헬퍼는 발코니 제외", () => {
    expect(floorAreaM2(T)).toBe(50);
  });
});
