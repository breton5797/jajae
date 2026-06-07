/**
 * lib/fulfillment — route an order line to hub stock (same-day) or supplier
 * dropship, with hub-stockout fallback. Pure; depends on lib/types + lib/utils.
 */
import type { RouteDecision } from "@/lib/types";
import { addDays } from "@/lib/utils";

export interface HubStock {
  hubId: string;
  qty: number;
  lat: number | null;
  lng: number | null;
}

function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Choose the fulfillment source for a line. Hub stock → same-day (eta 0d); else
 * supplier dropship (eta = lead time). Picks the nearest in-stock hub when site
 * coordinates are available.
 */
export function routeOrderLine(
  qty: number,
  hubs: HubStock[],
  opts: {
    siteLat?: number | null;
    siteLng?: number | null;
    supplierLeadDays: number;
  },
): RouteDecision {
  const inStock = hubs.filter((h) => h.qty >= qty);

  if (inStock.length === 0) {
    return {
      source: "dropship",
      hubId: null,
      etaDays: opts.supplierLeadDays,
      reason:
        hubs.length > 0
          ? "허브 재고 부족 → 공급사 직배송"
          : "허브 미보유 → 공급사 직배송",
    };
  }

  let best = inStock[0]!;
  if (
    typeof opts.siteLat === "number" &&
    typeof opts.siteLng === "number"
  ) {
    const site = { lat: opts.siteLat, lng: opts.siteLng };
    let bestDist = Infinity;
    for (const h of inStock) {
      if (typeof h.lat !== "number" || typeof h.lng !== "number") continue;
      const d = distanceKm(site, { lat: h.lat, lng: h.lng });
      if (d < bestDist) {
        bestDist = d;
        best = h;
      }
    }
  }

  return {
    source: "hub",
    hubId: best.hubId,
    etaDays: 0,
    reason: "허브 당일 출고",
  };
}

/** Compute an ETA date string from an order date + eta days. */
export function etaDate(orderDate: string, etaDays: number): string {
  return addDays(orderDate, etaDays);
}

/** Deduct hub inventory after allocation (immutable, floored at 0). */
export function deductHubStock(current: number, used: number): number {
  return Math.max(0, current - used);
}
