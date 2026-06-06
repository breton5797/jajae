/**
 * lib/forecast — demand forecasting + reorder points. Pure; lib/types + utils.
 * (Claude forecasting is an optional layer in ./ai; deterministic primary here.)
 */
import type {
  ForecastResult,
  PeriodDemand,
  ReorderDraftLine,
  ReorderRule,
  ReorderSuggestion,
} from "@/lib/types";
import { forecastAccuracy } from "@/lib/utils";

export { forecastAccuracy };

const mean = (xs: number[]) =>
  xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;

/** Aggregate order-item history into monthly demand points (ascending). */
export function aggregateDemandByPeriod(
  items: Array<{ created_at: string; qty: number }>,
): PeriodDemand[] {
  const byPeriod = new Map<string, number>();
  for (const it of items) {
    const period = it.created_at.slice(0, 7); // YYYY-MM
    byPeriod.set(period, (byPeriod.get(period) ?? 0) + Number(it.qty));
  }
  return [...byPeriod.entries()]
    .map(([period, qty]) => ({ period, qty }))
    .sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));
}

/**
 * Forecast the next period's demand from monthly history.
 * < 3 points → cold-start (low confidence). >= 12 points → seasonal index applied.
 */
export function forecastDemand(
  history: PeriodDemand[],
  targetMonthIndex?: number, // 0..11; defaults to month after last
): ForecastResult {
  const qtys = history.map((h) => h.qty);
  const n = qtys.length;

  if (n < 3) {
    return {
      predictedQty: Math.round(n === 0 ? 0 : mean(qtys)),
      confidence: n === 0 ? 0 : 0.2,
      method: "coldStart",
      coldStart: true,
    };
  }

  const last3 = qtys.slice(-3);
  const base = mean(last3);
  const slope = (qtys[n - 1]! - qtys[0]!) / (n - 1);

  // seasonality: needs >= 12 months
  let seasonalIndex = 1;
  let method: ForecastResult["method"] = "movingAvg";
  const avg = mean(qtys);
  if (n >= 12 && avg > 0) {
    const target =
      targetMonthIndex ?? (history.length % 12); // crude month slot
    const sameMonth = qtys.filter((_, i) => i % 12 === target % 12);
    if (sameMonth.length > 0) {
      seasonalIndex = mean(sameMonth) / avg;
      method = "seasonal";
    }
  }

  const predicted = Math.max(0, Math.round((base + slope) * seasonalIndex));

  // confidence: more history + lower variability → higher
  const variance = mean(qtys.map((q) => (q - avg) ** 2));
  const cv = avg > 0 ? Math.sqrt(variance) / avg : 1;
  const confidence = Math.max(
    0.2,
    Math.min(0.95, (n >= 12 ? 0.85 : 0.6) * (1 - Math.min(cv, 1) * 0.5)),
  );

  return {
    predictedQty: predicted,
    confidence: Math.round(confidence * 100) / 100,
    method,
    coldStart: false,
  };
}

/** Classic reorder-point check from a monthly forecast + rule. */
export function computeReorderSuggestion(
  rule: Pick<ReorderRule, "threshold" | "lead_time_days" | "product_id">,
  predictedMonthlyQty: number,
  currentStock: number,
): ReorderSuggestion {
  const dailyDemand = predictedMonthlyQty / 30;
  const reorderPoint = Math.ceil(
    dailyDemand * rule.lead_time_days + rule.threshold,
  );
  const needsReorder = currentStock <= reorderPoint;
  const suggestedQty = needsReorder
    ? Math.max(
        0,
        Math.ceil(
          dailyDemand * (rule.lead_time_days + 30) + rule.threshold - currentStock,
        ),
      )
    : 0;
  return {
    productId: rule.product_id,
    currentStock,
    reorderPoint,
    needsReorder,
    suggestedQty,
  };
}

/** Build a draft cart from the suggestions that need reordering. */
export function buildReorderDraft(
  suggestions: ReorderSuggestion[],
): ReorderDraftLine[] {
  return suggestions
    .filter((s) => s.needsReorder && s.suggestedQty > 0)
    .map((s) => ({ productId: s.productId, qty: s.suggestedQty }));
}
