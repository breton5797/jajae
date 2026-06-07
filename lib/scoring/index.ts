/**
 * lib/scoring — internal credit score from order/settlement history. Pure.
 * Model WEIGHTS are module-private (never persisted/exposed); rows store only the
 * resulting score + per-factor CONTRIBUTIONS, so partners/contractors never see
 * the raw scoring weights.
 */
import type {
  FinanceOffer,
  ScoreFactor,
  ScoreGrade,
  ScoreMetrics,
  ScoreResult,
} from "@/lib/types";
import { won } from "@/lib/utils";

const MAX_SCORE = 1000;

// Private model weights — intentionally NOT exported.
const WEIGHTS = {
  volume: 0.3,
  onTime: 0.3,
  reliability: 0.2, // (1 - returnRate)
  tenure: 0.2,
} as const;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function gradeFromScore(score: number, coldStart: boolean): ScoreGrade {
  if (coldStart) return "NEW";
  if (score >= 850) return "AAA";
  if (score >= 750) return "AA";
  if (score >= 650) return "A";
  if (score >= 500) return "B";
  return "C";
}

export function computeCreditScore(m: ScoreMetrics): ScoreResult {
  const coldStart = m.orderCount === 0;

  // normalize metrics to 0..1
  const volumeN = clamp01(m.gmv / 50_000_000); // ₩50M GMV → full
  const onTimeN = clamp01(m.onTimeSettlementRate);
  const reliabilityN = clamp01(1 - m.returnRate);
  const tenureN = clamp01(m.tenureMonths / 24); // 2 years → full

  const parts: Array<{ key: string; label: string; value: number; n: number; w: number }> = [
    { key: "volume", label: "거래 규모", value: m.gmv, n: volumeN, w: WEIGHTS.volume },
    { key: "onTime", label: "정산 적시성", value: m.onTimeSettlementRate, n: onTimeN, w: WEIGHTS.onTime },
    { key: "reliability", label: "반품/AS 신뢰도", value: m.returnRate, n: reliabilityN, w: WEIGHTS.reliability },
    { key: "tenure", label: "거래 기간", value: m.tenureMonths, n: tenureN, w: WEIGHTS.tenure },
  ];

  const factors: ScoreFactor[] = parts.map((p) => ({
    key: p.key,
    label: p.label,
    value: p.value,
    contribution: Math.round(p.n * p.w * MAX_SCORE),
  }));

  const score = coldStart
    ? 300
    : factors.reduce((s, f) => s + f.contribution, 0);

  return { score, grade: gradeFromScore(score, coldStart), factors, coldStart };
}

/** Map a score/grade to a financing limit + rate. */
export function scoreToFinanceOffer(result: ScoreResult): FinanceOffer {
  if (result.coldStart || result.grade === "C") {
    return {
      eligible: false,
      limit: 0,
      rate: 0,
      reason: "신용점수가 낮아 금융 상품을 이용할 수 없습니다.",
    };
  }
  const table: Record<ScoreGrade, { limit: number; rate: number }> = {
    AAA: { limit: 100_000_000, rate: 0.012 },
    AA: { limit: 50_000_000, rate: 0.018 },
    A: { limit: 30_000_000, rate: 0.025 },
    B: { limit: 10_000_000, rate: 0.035 },
    C: { limit: 0, rate: 0 },
    NEW: { limit: 0, rate: 0 },
  };
  const t = table[result.grade];
  return { eligible: t.limit > 0, limit: won(t.limit), rate: t.rate, reason: null };
}
