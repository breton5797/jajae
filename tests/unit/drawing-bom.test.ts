import { describe, it, expect } from "vitest";
import {
  analyzeDrawing,
  bomFromRooms,
  roomsToBomInput,
  totalArea,
} from "@/lib/ai-quote";
import type { RoomArea } from "@/lib/types";

const rooms: RoomArea[] = [
  { name: "거실", type: "living", areaM2: 20 },
  { name: "안방", type: "room", areaM2: 12 },
  { name: "욕실1", type: "bathroom", areaM2: 4 },
  { name: "욕실2", type: "bathroom", areaM2: 3 },
  { name: "주방", type: "kitchen", areaM2: 8 },
];

describe("rooms → BOM", () => {
  it("derives area + bathroom count from rooms", () => {
    expect(totalArea(rooms)).toBe(47);
    const input = roomsToBomInput(rooms, "standard");
    expect(input.dimensions?.bathroomCount).toBe(2);
    expect(input.areaPyeong).toBeCloseTo(47 / 3.3058, 1);
  });

  it("produces a multi-category BOM that reuses the deterministic estimator", () => {
    const bom = bomFromRooms(rooms, "standard");
    expect(bom.lines.length).toBeGreaterThanOrEqual(8);
    expect(bom.estTotal).toBeGreaterThan(0);
    expect(bom.source).toBe("fallback");
  });
});

describe("analyzeDrawing", () => {
  it("uses manual rooms when provided (no API key needed)", async () => {
    const res = await analyzeDrawing({ rooms, specLevel: "standard" });
    expect(res.source).toBe("manual");
    expect(res.rooms).toHaveLength(5);
    expect(res.totalAreaM2).toBe(47);
    expect(res.bom.lines.length).toBeGreaterThan(0);
  });

  it("throws when neither rooms nor an analyzable image is available", async () => {
    await expect(
      analyzeDrawing({ specLevel: "standard" }),
    ).rejects.toThrow(/공간 정보/);
  });
});
