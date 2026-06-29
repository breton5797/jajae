// lib/proposal/construction.ts
/**
 * 면적·세대 구성·사양 기반 시공(노무·공정) 비용 추정 (순수·결정론).
 * 자재(마감재 카탈로그)와 별개의 "공사비"를 항목별로 산출 → 자재비와 합산해 총액 구성.
 */
import type { ApartmentTemplate, SpecLevel } from "@/lib/types";

export interface ConstructionLine {
  label: string;
  amount: number;
}
export interface ConstructionEstimate {
  total: number;
  lines: ConstructionLine[];
}

/** 전용면적 ㎡당 표준 단가(원) — standard 기준. */
const PER_M2 = {
  demolition: 70000, // 철거·폐기물
  electrical: 60000, // 전기·조명 공사
  carpentry: 120000, // 목공·창호·도어 설치
  finishLabor: 90000, // 도장·도배·바닥·타일 시공(노무)
  management: 50000, // 현장관리·경비
} as const;

const PLUMBING_PER_BATH = 700000; // 욕실 1개소 설비·방수
const PLUMBING_PER_KITCHEN = 500000; // 주방 설비

const TIER_FACTOR: Record<SpecLevel, number> = {
  economy: 0.85,
  standard: 1.0,
  premium: 1.3,
};

const toThousand = (n: number): number => Math.round(n / 1000) * 1000;

export function estimateConstruction(
  t: ApartmentTemplate,
  spec: SpecLevel,
): ConstructionEstimate {
  const f = TIER_FACTOR[spec];
  const area = t.exclusiveM2;
  const kitchens = t.rooms.filter((r) => r.type === "kitchen").length || 1;

  const lines: ConstructionLine[] = [
    { label: "철거·폐기물", amount: toThousand(area * PER_M2.demolition * f) },
    { label: "전기·조명 공사", amount: toThousand(area * PER_M2.electrical * f) },
    { label: "목공·창호·도어", amount: toThousand(area * PER_M2.carpentry * f) },
    {
      label: "설비·방수",
      amount: toThousand(
        (t.bathrooms * PLUMBING_PER_BATH + kitchens * PLUMBING_PER_KITCHEN) * f,
      ),
    },
    { label: "도장·도배·바닥 시공", amount: toThousand(area * PER_M2.finishLabor * f) },
    { label: "현장관리·경비", amount: toThousand(area * PER_M2.management * f) },
  ];

  return { total: lines.reduce((s, l) => s + l.amount, 0), lines };
}
