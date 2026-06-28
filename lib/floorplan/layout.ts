/**
 * lib/floorplan/layout.ts
 * Pure, deterministic floor-plan layout via shelf/row packing.
 * No IO, no AI — 100% unit-testable.
 */
import type { EstimateRoom, FloorPlan, FloorPlanRoom, RoomType } from "@/lib/types";

const MIN_DIM_M = 0.5;

type NormalizedRoom = {
  name: string;
  type: RoomType;
  w: number;
  h: number;
};

type PackAcc = {
  placed: FloorPlanRoom[];
  curX: number;
  curY: number;
  rowH: number;
};

function clampDim(v: number): number {
  return Math.max(MIN_DIM_M, v);
}

function normalizeRooms(rooms: EstimateRoom[]): NormalizedRoom[] {
  return rooms.map((r) => ({
    name: r.name,
    type: r.type,
    w: clampDim(r.widthM),
    h: clampDim(r.lengthM),
  }));
}

function sortByAreaDesc(rooms: NormalizedRoom[]): NormalizedRoom[] {
  return [...rooms].sort((a, b) => b.w * b.h - a.w * a.h);
}

/** Target max row width ≈ √totalArea × 1.4 (landscape-ish layout). */
function computeMaxRowWidth(rooms: NormalizedRoom[]): number {
  const totalArea = rooms.reduce((s, r) => s + r.w * r.h, 0);
  return Math.sqrt(totalArea) * 1.4;
}

function packRooms(rooms: NormalizedRoom[], maxRowWidth: number): FloorPlanRoom[] {
  const { placed } = rooms.reduce<PackAcc>(
    (acc, r) => {
      const wrap = acc.curX > 0 && acc.curX + r.w > maxRowWidth;
      const x = wrap ? 0 : acc.curX;
      const y = wrap ? acc.curY + acc.rowH : acc.curY;
      return {
        placed: [
          ...acc.placed,
          { name: r.name, type: r.type, x, y, w: r.w, h: r.h },
        ],
        curX: x + r.w,
        curY: wrap ? y : acc.curY,
        rowH: wrap ? r.h : Math.max(acc.rowH, r.h),
      };
    },
    { placed: [], curX: 0, curY: 0, rowH: 0 },
  );
  return placed;
}

function computeBounds(rooms: FloorPlanRoom[]): { widthM: number; lengthM: number } {
  return rooms.reduce(
    (bounds, r) => ({
      widthM: Math.max(bounds.widthM, r.x + r.w),
      lengthM: Math.max(bounds.lengthM, r.y + r.h),
    }),
    { widthM: 0, lengthM: 0 },
  );
}

/**
 * Layout rooms using shelf/row packing.
 * Rooms are sorted by area (largest first). A new row is started when the next
 * room would exceed √(totalArea) × 1.4. Returns FloorPlan with room coordinates
 * and overall bounds.
 *
 * Pure and deterministic — no IO, no randomness, no mutation.
 */
export function layoutRooms(rooms: EstimateRoom[]): FloorPlan {
  if (rooms.length === 0) {
    return { rooms: [], widthM: 0, lengthM: 0 };
  }

  const normalized = normalizeRooms(rooms);
  const sorted = sortByAreaDesc(normalized);
  const maxRowWidth = computeMaxRowWidth(sorted);
  const placed = packRooms(sorted, maxRowWidth);
  const { widthM, lengthM } = computeBounds(placed);

  return { rooms: placed, widthM, lengthM };
}
