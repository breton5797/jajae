// lib/proposal/templates/index.ts
import type { ApartmentTemplate } from "@/lib/types";
import { APARTMENT_TEMPLATES } from "./data";

export { APARTMENT_TEMPLATES };

const BANDS = [10, 20, 30, 40, 50] as const;

/** 평수 → 가장 가까운 평형대(10~50). */
function nearestBand(pyeong: number): (typeof BANDS)[number] {
  return BANDS.reduce((best, b) =>
    Math.abs(b - pyeong) < Math.abs(best - pyeong) ? b : best, BANDS[0]);
}

/**
 * 평수+방/욕실수로 최근접 템플릿 선택.
 * 1) 평형대 일치 후보 → 없으면 전체.
 * 2) |Δbedrooms|+|Δbathrooms| 최소, 동률이면 전용면적 차 최소.
 */
export function matchTemplate(input: {
  pyeong: number; bedrooms: number; bathrooms: number;
}): ApartmentTemplate {
  const band = nearestBand(input.pyeong);
  const pool = APARTMENT_TEMPLATES.filter((t) => t.pyeongBand === band);
  const candidates = pool.length > 0 ? pool : APARTMENT_TEMPLATES;
  const score = (t: ApartmentTemplate) =>
    Math.abs(t.bedrooms - input.bedrooms) + Math.abs(t.bathrooms - input.bathrooms);
  const targetM2 = input.pyeong * 3.3058;
  return [...candidates].sort((a, b) => {
    const s = score(a) - score(b);
    if (s !== 0) return s;
    return Math.abs(a.exclusiveM2 - targetM2) - Math.abs(b.exclusiveM2 - targetM2);
  })[0]!;
}
