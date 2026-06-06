/**
 * lib/pricing — cross-supplier price intelligence. Pure; depends on lib/types only.
 */
import type {
  LowestPriceAlert,
  PriceComparison,
  PriceComparisonRow,
  PriceHistory,
  PriceTrendPoint,
  Product,
} from "@/lib/types";
import { won } from "@/lib/utils";

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
}

/**
 * Compare prices for products in one category (optionally pre-filtered by spec).
 * Returns rows sorted cheapest-first plus min/max/median stats.
 */
export function comparePrices(
  products: Product[],
  categoryId: string,
): PriceComparison {
  const inCat = products.filter(
    (p) => p.category_id === categoryId && p.status === "approved",
  );
  const prices = inCat.map((p) => p.unit_price).sort((a, b) => a - b);
  const min = prices[0] ?? 0;
  const max = prices[prices.length - 1] ?? 0;

  const rows: PriceComparisonRow[] = inCat
    .map((p) => ({
      productId: p.id,
      productName: p.name,
      brand: p.brand,
      supplierId: p.supplier_id,
      unitPrice: p.unit_price,
      stock: p.stock,
      leadTimeDays: p.lead_time_days,
      isLowest: p.unit_price === min,
      savingsVsMax: max - p.unit_price,
    }))
    .sort((a, b) => a.unitPrice - b.unitPrice);

  return { categoryId, rows, min, max, median: median(prices), count: inCat.length };
}

/** Normalize an arbitrary date/price series into a sorted trend. */
export function buildPriceTrend(
  points: Array<{ date: string; price: number }>,
): PriceTrendPoint[] {
  return [...points]
    .map((p) => ({ date: p.date.slice(0, 10), price: won(p.price) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function trendFromPriceHistory(rows: PriceHistory[]): PriceTrendPoint[] {
  return buildPriceTrend(
    rows.map((r) => ({ date: r.recorded_at, price: r.unit_price })),
  );
}

export function trendFromOrderItems(
  items: Array<{ created_at: string; unit_price_snapshot: number }>,
): PriceTrendPoint[] {
  return buildPriceTrend(
    items.map((i) => ({ date: i.created_at, price: i.unit_price_snapshot })),
  );
}

/**
 * For each previously-purchased item, surface a cheaper in-stock alternative in
 * the same category (lowest-price alert).
 */
export function lowestPriceAlerts(
  purchased: Array<{
    productId: string;
    productName: string;
    paidPrice: number;
    categoryId: string;
  }>,
  catalog: Product[],
): LowestPriceAlert[] {
  const alerts: LowestPriceAlert[] = [];

  for (const item of purchased) {
    const alternatives = catalog.filter(
      (p) =>
        p.category_id === item.categoryId &&
        p.status === "approved" &&
        p.stock > 0 &&
        p.id !== item.productId &&
        p.unit_price < item.paidPrice,
    );
    if (alternatives.length === 0) continue;

    const cheapest = alternatives.reduce((lo, p) =>
      p.unit_price < lo.unit_price ? p : lo,
    );
    const savings = item.paidPrice - cheapest.unit_price;
    alerts.push({
      productId: item.productId,
      productName: item.productName,
      paidPrice: item.paidPrice,
      cheaperProductId: cheapest.id,
      cheaperProductName: cheapest.name,
      cheaperPrice: cheapest.unit_price,
      savings,
      savingsPct:
        item.paidPrice > 0 ? Math.round((savings / item.paidPrice) * 100) : 0,
    });
  }

  return alerts.sort((a, b) => b.savings - a.savings);
}
