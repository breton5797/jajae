/**
 * Convert extracted floor-plan rooms into a BOM by REUSING the existing
 * deterministic estimator (generateBomDeterministic). Pure & testable.
 */
import type {
  BomInput,
  BomResult,
  ProjectType,
  RoomArea,
  SpecLevel,
} from "@/lib/types";
import { generateBomDeterministic } from "./bom";

const PYEONG_TO_M2 = 3.3058;

export function totalArea(rooms: RoomArea[]): number {
  return rooms.reduce((sum, r) => sum + Math.max(0, r.areaM2), 0);
}

export function roomsToBomInput(
  rooms: RoomArea[],
  specLevel: SpecLevel,
  projectType: ProjectType = "apartment_remodel",
): BomInput {
  const areaM2 = totalArea(rooms);
  const bathroomCount =
    rooms.filter((r) => r.type === "bathroom").length || 1;
  return {
    projectType,
    areaPyeong: Math.max(1, Math.round((areaM2 / PYEONG_TO_M2) * 10) / 10),
    dimensions: { bathroomCount },
    specLevel,
  };
}

/** Floor-plan rooms → itemized BOM (delegates to the shared estimator). */
export function bomFromRooms(
  rooms: RoomArea[],
  specLevel: SpecLevel,
  projectType?: ProjectType,
): BomResult {
  return generateBomDeterministic(roomsToBomInput(rooms, specLevel, projectType));
}
