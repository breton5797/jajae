// lib/studio/from-floorplan.ts
/** ApartmentTemplate + 선택 마감재 → 3D 렌더용 FurnishedScene (순수). */
import { ASSETS, type StudioAsset } from "@/lib/studio/assets";
import type { ApartmentTemplate, FinishSelection, RoomSlot, Transform3D } from "@/lib/types";

const DEFAULT_FLOOR = "#C7A878";
const DEFAULT_WALL = "#ECE9E3";

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

export function toFurnishedScene(
  t: ApartmentTemplate, finishes: FinishSelection[],
): FurnishedScene {
  const widthM = Math.max(...t.rooms.map((r) => r.x + r.w));
  const lengthM = Math.max(...t.rooms.map((r) => r.y + r.h));
  const furniture: PlacedAsset[] = t.furniture
    .map((f) => {
      const asset = assetById(f.assetId);
      return asset ? { asset, transform: f.transform } : null;
    })
    .filter((x): x is PlacedAsset => x !== null);

  return {
    rooms: t.rooms,
    furniture,
    floorColor: colorOf(finishes, "flooring") ?? DEFAULT_FLOOR,
    wallColor: colorOf(finishes, "paint") ?? colorOf(finishes, "wallpaper") ?? DEFAULT_WALL,
    widthM,
    lengthM,
  };
}
