import { describe, it, expect } from "vitest";
import {
  batchPosIntoRuns,
  nearestNeighborSequence,
  suggestDeliveryWindows,
  haversineKm,
} from "@/lib/logistics";
import type { OpenPoForBatching, RunStop } from "@/lib/types";

function po(over: Partial<OpenPoForBatching>): OpenPoForBatching {
  return {
    poId: over.poId ?? "po",
    supplierId: over.supplierId ?? "s",
    siteId: over.siteId ?? "site",
    region: over.region ?? "서울 강남",
    date: over.date ?? "2026-06-10",
    lat: over.lat ?? null,
    lng: over.lng ?? null,
  };
}

describe("batchPosIntoRuns", () => {
  it("batches POs sharing region+date into one run", () => {
    const runs = batchPosIntoRuns([
      po({ poId: "p1" }),
      po({ poId: "p2" }),
      po({ poId: "p3" }),
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.poCount).toBe(3);
    expect(runs[0]?.singlePo).toBe(false);
    expect(runs[0]?.stops.map((s) => s.sequence)).toEqual([1, 2, 3]);
  });

  it("separates different regions and flags single-PO runs", () => {
    const runs = batchPosIntoRuns([
      po({ poId: "p1", region: "서울 강남" }),
      po({ poId: "p2", region: "부산 해운대" }),
    ]);
    expect(runs).toHaveLength(2);
    expect(runs.every((r) => r.singlePo)).toBe(true);
  });
});

describe("nearestNeighborSequence", () => {
  it("orders stops by proximity when coords exist", () => {
    const stops: RunStop[] = [
      { poId: "a", siteId: null, sequence: 0, lat: 37.5, lng: 127.0 },
      { poId: "c", siteId: null, sequence: 0, lat: 37.7, lng: 127.2 },
      { poId: "b", siteId: null, sequence: 0, lat: 37.55, lng: 127.05 },
    ];
    const ordered = nearestNeighborSequence(stops);
    expect(ordered.map((s) => s.poId)).toEqual(["a", "b", "c"]);
  });

  it("falls back to input order without coords", () => {
    const stops: RunStop[] = [
      { poId: "x", siteId: null, sequence: 0, lat: null, lng: null },
      { poId: "y", siteId: null, sequence: 0, lat: null, lng: null },
    ];
    expect(nearestNeighborSequence(stops).map((s) => s.poId)).toEqual(["x", "y"]);
  });
});

describe("suggestDeliveryWindows", () => {
  it("merges POs for the same site/date into one window", () => {
    const windows = suggestDeliveryWindows([
      po({ poId: "p1", siteId: "siteA" }),
      po({ poId: "p2", siteId: "siteA" }),
      po({ poId: "p3", siteId: "siteB" }),
    ]);
    const a = windows.find((w) => w.siteId === "siteA");
    expect(a?.poIds).toHaveLength(2);
    expect(a?.windowLabel).toContain("통합");
  });
});

describe("haversineKm", () => {
  it("computes a sane distance", () => {
    const d = haversineKm({ lat: 37.5, lng: 127.0 }, { lat: 37.6, lng: 127.0 });
    expect(d).toBeGreaterThan(10);
    expect(d).toBeLessThan(13);
  });
});
