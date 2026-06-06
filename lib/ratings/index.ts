/**
 * lib/ratings — supplier composite trust score + rating-aware ranking. Pure.
 */
import type {
  Product,
  RatingTier,
  SupplierRating,
  SupplierRatingMetrics,
} from "@/lib/types";

const W_ON_TIME = 0.4;
const W_RELIABILITY = 0.3; // (1 - returnRate)
const W_QUALITY = 0.3;

export function ratingTier(composite: number, orderCount: number): RatingTier {
  if (orderCount === 0) return "신규";
  if (composite >= 4.5) return "최우수";
  if (composite >= 4.0) return "우수";
  if (composite >= 3.0) return "양호";
  return "주의";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Composite supplier score (0..5) from delivery on-time rate, return/AS rate,
 * and quality reviews. New suppliers (no orders) get a neutral 0 / 신규 tier.
 */
export function computeSupplierRating(
  m: SupplierRatingMetrics,
): SupplierRating {
  const onTime = m.deliveredTotal > 0 ? m.deliveredOnTime / m.deliveredTotal : 0;
  const returnRate =
    m.orderCount > 0 ? (m.returns + m.asCount) / m.orderCount : 0;
  const qualityAvg =
    m.qualityReviews.length > 0
      ? m.qualityReviews.reduce((s, r) => s + r, 0) / m.qualityReviews.length
      : 0;

  const reliability = Math.max(0, 1 - returnRate);
  const composite =
    m.orderCount === 0
      ? 0
      : round2(
          (W_ON_TIME * onTime +
            W_RELIABILITY * reliability +
            W_QUALITY * (qualityAvg / 5)) *
            5,
        );

  return {
    onTime: round2(onTime),
    returnRate: round2(returnRate),
    qualityAvg: round2(qualityAvg),
    composite,
    orderCount: m.orderCount,
    reviewCount: m.qualityReviews.length,
    tier: ratingTier(composite, m.orderCount),
  };
}

/**
 * Rank products by value = price competitiveness blended with supplier rating.
 * Used for catalog ranking and rating-aware supplier_match. Lower price + higher
 * rating ranks first. Pure.
 */
export function sortProductsByValue(
  products: Product[],
  ratingBySupplier: Map<string, number>,
): Product[] {
  if (products.length === 0) return [];
  const prices = products.map((p) => p.unit_price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const score = (p: Product): number => {
    const priceScore = 1 - (p.unit_price - min) / range; // 1 = cheapest
    const rating = (ratingBySupplier.get(p.supplier_id) ?? 0) / 5; // 0..1
    return 0.6 * priceScore + 0.4 * rating;
  };

  return [...products].sort((a, b) => score(b) - score(a));
}

/** Pick the best supplier product in a set (rating-aware). */
export function pickBestByValue(
  products: Product[],
  ratingBySupplier: Map<string, number>,
): Product | null {
  return sortProductsByValue(products, ratingBySupplier)[0] ?? null;
}
