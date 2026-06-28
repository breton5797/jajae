/**
 * lib/estimate/index.ts
 * Assembles floor plan + BOM + total from a confirmed EstimateBrief.
 * Pure-ish: no DB access; caller passes the product catalog.
 */
import type {
  BomResult,
  Category,
  EstimateBrief,
  FloorPlan,
  Product,
  RoomArea,
} from "@/lib/types";
import { bomFromRooms, matchBomToProducts } from "@/lib/ai-quote";
import { layoutRooms } from "@/lib/floorplan/layout";

export interface EstimateResult {
  floorPlan: FloorPlan;
  bom: BomResult;
  totalKRW: number;
}

function toRoomAreas(brief: EstimateBrief): RoomArea[] {
  return brief.rooms.map((r) => ({
    name: r.name,
    type: r.type,
    areaM2: Math.max(0.5, r.widthM) * Math.max(0.5, r.lengthM),
  }));
}

function buildSlugToIdMap(categories: Category[]): Map<string, string> {
  return new Map(categories.map((c) => [c.slug, c.id]));
}

/**
 * Build a full estimate from a brief and product catalog.
 *
 * 1. layoutRooms → FloorPlan (shelf packing).
 * 2. EstimateRoom[] → RoomArea[] (areaM2 = widthM × lengthM, min 0.25 m²).
 * 3. bomFromRooms (deterministic) → raw BomResult.
 * 4. matchBomToProducts → BomResult enriched with real product IDs + prices.
 * 5. totalKRW = Math.round(bom.estTotal).
 *
 * @param brief    Confirmed EstimateBrief.
 * @param catalog  categories + approved products fetched from DB.
 */
export async function buildEstimate(
  brief: EstimateBrief,
  catalog: { categories: Category[]; products: Product[] },
): Promise<EstimateResult> {
  const floorPlan = layoutRooms(brief.rooms);
  const roomAreas = toRoomAreas(brief);
  const rawBom = bomFromRooms(roomAreas, brief.specLevel, brief.projectType);
  const slugToId = buildSlugToIdMap(catalog.categories);
  const bom = matchBomToProducts(rawBom, catalog.products, slugToId);
  const totalKRW = Math.round(bom.estTotal);

  return { floorPlan, bom, totalKRW };
}
