import { describe, it, expect } from "vitest";
import { layoutRooms } from "@/lib/floorplan/layout";
import type { EstimateRoom } from "@/lib/types";

/** 테스트용 EstimateRoom 팩토리 */
const room = (name: string, widthM: number, lengthM: number): EstimateRoom => ({
  name,
  type: "room",
  widthM,
  lengthM,
});

describe("layoutRooms", () => {
  it("빈 배열 → { rooms: [], widthM: 0, lengthM: 0 }", () => {
    expect(layoutRooms([])).toEqual({ rooms: [], widthM: 0, lengthM: 0 });
  });

  it("N개 방 → N개 FloorPlanRoom (x/y/w/h 모두 number)", () => {
    const plan = layoutRooms([room("A", 5, 4), room("B", 4, 3), room("C", 2, 2)]);
    expect(plan.rooms).toHaveLength(3);
    for (const r of plan.rooms) {
      expect(typeof r.x).toBe("number");
      expect(typeof r.y).toBe("number");
      expect(typeof r.w).toBe("number");
      expect(typeof r.h).toBe("number");
    }
  });

  it("w/h 가 입력 widthM/lengthM 을 정확히 반영한다", () => {
    const plan = layoutRooms([room("거실", 5, 4), room("주방", 3, 2.5)]);
    const living = plan.rooms.find((r) => r.name === "거실")!;
    const kitchen = plan.rooms.find((r) => r.name === "주방")!;
    expect(living.w).toBe(5);
    expect(living.h).toBe(4);
    expect(kitchen.w).toBe(3);
    expect(kitchen.h).toBe(2.5);
  });

  it("결정론: 동일 입력을 두 번 호출하면 deep-equal 결과", () => {
    const rooms = [room("A", 5, 4), room("B", 4, 3), room("C", 2, 2)];
    expect(layoutRooms(rooms)).toEqual(layoutRooms(rooms));
  });

  it("경계: widthM ≥ max(x+w), lengthM ≥ max(y+h) for all rooms", () => {
    const plan = layoutRooms([
      room("A", 5, 4),
      room("B", 4, 3),
      room("C", 3, 2.5),
      room("D", 2, 2),
    ]);
    for (const r of plan.rooms) {
      expect(plan.widthM).toBeGreaterThanOrEqual(r.x + r.w);
      expect(plan.lengthM).toBeGreaterThanOrEqual(r.y + r.h);
    }
  });

  it("정렬: 면적 최대 방이 (x:0, y:0)에 배치된다", () => {
    const plan = layoutRooms([
      room("작은방", 2, 2),
      room("거실", 6, 5), // 30 m² — 최대 면적
      room("안방", 3, 3),
    ]);
    const largest = plan.rooms.find((r) => r.name === "거실")!;
    expect(largest.x).toBe(0);
    expect(largest.y).toBe(0);
  });

  it("widthM/lengthM 이 0 이면 w/h ≥ 0.5 로 고정된다", () => {
    const plan = layoutRooms([room("극소방", 0, 0)]);
    expect(plan.rooms[0]!.w).toBeGreaterThanOrEqual(0.5);
    expect(plan.rooms[0]!.h).toBeGreaterThanOrEqual(0.5);
  });

  it("음수 치수도 0.5 로 고정된다", () => {
    const plan = layoutRooms([room("음수방", -1, -2)]);
    expect(plan.rooms[0]!.w).toBeGreaterThanOrEqual(0.5);
    expect(plan.rooms[0]!.h).toBeGreaterThanOrEqual(0.5);
  });
});
