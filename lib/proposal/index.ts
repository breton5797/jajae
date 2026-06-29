// lib/proposal/index.ts
import type {
  ApartmentTemplate, BomResult, Category, EstimateBrief, FinishMaterial,
  FinishSelection, Product, RoomType,
} from "@/lib/types";
import { buildEstimate } from "@/lib/estimate";
import { matchTemplate } from "./templates";
import { selectFinishes, materialsTotal } from "./materials";
import { renderPlanSvg } from "./floorplan-svg";
import { estimateConstruction, type ConstructionLine } from "./construction";
import { toFurnishedScene, type FurnishedScene } from "@/lib/studio/from-floorplan";

export interface BuiltProposal {
  template: ApartmentTemplate;
  finishes: FinishSelection[];
  furnishedScene: FurnishedScene;
  floorPlanSvg: string;
  bom: BomResult;
  materialsKRW: number;
  constructionKRW: number;
  constructionLines: ConstructionLine[];
  totalKRW: number;
}

/** 평수: brief.pyeong 우선, 없으면 룸 면적 합에서 도출. */
function resolvePyeong(brief: EstimateBrief): number {
  if (brief.pyeong && brief.pyeong > 0) return brief.pyeong;
  const m2 = brief.rooms.reduce((s, r) => s + r.widthM * r.lengthM, 0);
  return Math.max(10, Math.round(m2 / 3.3058));
}
const count = (brief: EstimateBrief, type: RoomType) =>
  brief.rooms.filter((r) => r.type === type).length;

export async function buildProposal(
  brief: EstimateBrief,
  catalog: { categories: Category[]; products: Product[]; finishes: FinishMaterial[] },
): Promise<BuiltProposal> {
  const template = matchTemplate({
    pyeong: resolvePyeong(brief),
    bedrooms: Math.max(1, count(brief, "room")),
    bathrooms: Math.max(1, count(brief, "bathroom")),
  });

  // 시공비를 먼저 산출(사양·면적 기반) → 자재 예산 = 총예산 - 시공비 로 제약.
  const construction = estimateConstruction(template, brief.specLevel);
  const materialsBudget =
    brief.budgetKRW != null && brief.budgetKRW > 0
      ? Math.max(0, brief.budgetKRW - construction.total)
      : undefined;
  const finishes = selectFinishes(
    brief,
    template,
    catalog.finishes,
    materialsBudget !== undefined ? { budgetOverride: materialsBudget } : undefined,
  );

  const furnishedScene = toFurnishedScene(template, finishes);
  const floorPlanSvg = renderPlanSvg(template);
  const estimate = await buildEstimate(brief, {
    categories: catalog.categories,
    products: catalog.products,
  });

  const materialsKRW = materialsTotal(finishes);
  const constructionKRW = construction.total;
  return {
    template,
    finishes,
    furnishedScene,
    floorPlanSvg,
    bom: estimate.bom,
    materialsKRW,
    constructionKRW,
    constructionLines: construction.lines,
    totalKRW: materialsKRW + constructionKRW,
  };
}
