// lib/studio/from-floorplan.ts
/** ApartmentTemplate + 선택 마감재 → 3D 렌더용 FurnishedScene (순수). */
import { ASSETS, type StudioAsset } from "@/lib/studio/assets";
import type {
  ApartmentTemplate, FinishSelection, RoomSlot, RoomType, Transform3D,
} from "@/lib/types";

const DEFAULT_FLOOR = "#C7A878";
const DEFAULT_WALL = "#ECE9E3";

/** 가구 미배치 거주방을 채울 룸 타입별 기본 에셋. */
const ENRICH_BY_TYPE: Partial<Record<RoomType, string>> = {
  living: "sofa",
  room: "bed",
  kitchen: "table",
};

export interface PlacedAsset { asset: StudioAsset; transform: Transform3D; }
export interface FurnishedScene {
  rooms: RoomSlot[];
  furniture: PlacedAsset[];
  floorColor: string;
  wallColor: string;
  widthM: number;
  lengthM: number;
}

const assetById = (id: string): StudioAsset | undefined => ASSETS.find((a) => a.id === id);
const colorOf = (finishes: FinishSelection[], cat: string): string | undefined =>
  finishes.find((f) => f.category === cat)?.material.color;

const centered = (room: RoomSlot): Transform3D => ({
  position: [room.x + room.w / 2, 0, room.y + room.h / 2],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
});

export function toFurnishedScene(
  t: ApartmentTemplate, finishes: FinishSelection[],
): FurnishedScene {
  const widthM = Math.max(...t.rooms.map((r) => r.x + r.w));
  const lengthM = Math.max(...t.rooms.map((r) => r.y + r.h));

  // 1) 템플릿에 명시된 가구(유효 assetId만)
  const placed: PlacedAsset[] = t.furniture
    .map((f) => {
      const asset = assetById(f.assetId);
      return asset ? { asset, transform: f.transform } : null;
    })
    .filter((x): x is PlacedAsset => x !== null);

  // 2) 빈 거주방 자동 채움 — 타입별 기본 가구를 방 중앙에 배치
  const furnishedRooms = new Set(t.furniture.map((f) => f.roomName));
  const enriched: PlacedAsset[] = t.rooms
    .filter((r) => !furnishedRooms.has(r.name) && ENRICH_BY_TYPE[r.type])
    .map((r) => {
      const asset = assetById(ENRICH_BY_TYPE[r.type]!);
      return asset ? { asset, transform: centered(r) } : null;
    })
    .filter((x): x is PlacedAsset => x !== null);

  return {
    rooms: t.rooms,
    furniture: [...placed, ...enriched],
    floorColor: colorOf(finishes, "flooring") ?? DEFAULT_FLOOR,
    wallColor: colorOf(finishes, "paint") ?? colorOf(finishes, "wallpaper") ?? DEFAULT_WALL,
    widthM,
    lengthM,
  };
}
