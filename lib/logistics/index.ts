/**
 * lib/logistics — batch open POs into regional delivery runs + sequence stops.
 * Pure; depends on lib/types only. (AI batching is an optional layer in ./ai.)
 */
import type {
  DeliveryRunProposal,
  DeliveryWindow,
  OpenPoForBatching,
  RunStop,
} from "@/lib/types";

/** Great-circle distance in km between two coordinates. */
export function haversineKm(
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

interface Coord {
  lat: number | null;
  lng: number | null;
}
function hasCoords(s: Coord): s is { lat: number; lng: number } {
  return typeof s.lat === "number" && typeof s.lng === "number";
}

/**
 * Greedy nearest-neighbor ordering to minimize trip distance. Falls back to the
 * input order when any stop lacks coordinates.
 */
export function nearestNeighborSequence(stops: RunStop[]): RunStop[] {
  if (stops.length <= 1) return stops.map((s, i) => ({ ...s, sequence: i + 1 }));
  if (!stops.every(hasCoords)) {
    return stops.map((s, i) => ({ ...s, sequence: i + 1 }));
  }

  const remaining = [...stops];
  const ordered: RunStop[] = [];
  let current = remaining.shift()!;
  ordered.push(current);

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i]!;
      const d = haversineKm(
        { lat: current.lat as number, lng: current.lng as number },
        { lat: cand.lat as number, lng: cand.lng as number },
      );
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    current = remaining.splice(bestIdx, 1)[0]!;
    ordered.push(current);
  }

  return ordered.map((s, i) => ({ ...s, sequence: i + 1 }));
}

/**
 * Group open POs into delivery runs by (region, date) and sequence each run.
 * A region with a single PO still becomes a run (singlePo=true).
 */
export function batchPosIntoRuns(
  pos: OpenPoForBatching[],
): DeliveryRunProposal[] {
  const groups = new Map<string, OpenPoForBatching[]>();
  for (const po of pos) {
    if (!po.region || !po.date) continue;
    const key = `${po.region}__${po.date}`;
    groups.set(key, [...(groups.get(key) ?? []), po]);
  }

  const proposals: DeliveryRunProposal[] = [];
  for (const key of [...groups.keys()].sort()) {
    const group = groups.get(key) ?? [];
    const first = group[0]!;
    const rawStops: RunStop[] = group.map((po) => ({
      poId: po.poId,
      siteId: po.siteId,
      sequence: 0,
      lat: po.lat,
      lng: po.lng,
    }));
    proposals.push({
      region: first.region,
      date: first.date,
      stops: nearestNeighborSequence(rawStops),
      poCount: group.length,
      singlePo: group.length === 1,
    });
  }
  return proposals;
}

/** One consolidated delivery window per site/date (merges that site's POs). */
export function suggestDeliveryWindows(
  pos: OpenPoForBatching[],
): DeliveryWindow[] {
  const bySite = new Map<string, OpenPoForBatching[]>();
  for (const po of pos) {
    const key = `${po.siteId ?? "none"}__${po.date}`;
    bySite.set(key, [...(bySite.get(key) ?? []), po]);
  }
  return [...bySite.values()]
    .filter((g) => g[0]?.siteId)
    .map((g) => {
      const first = g[0]!;
      return {
        siteId: first.siteId as string,
        date: first.date,
        poIds: g.map((p) => p.poId),
        windowLabel: g.length > 1 ? "오전 일괄배송 (통합)" : "오전 배송",
      };
    });
}
