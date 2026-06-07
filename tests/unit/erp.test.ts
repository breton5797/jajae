import { describe, it, expect } from "vitest";
import {
  reconcileStockUpdate,
  dedupeByExternalId,
  filterPosForErp,
  validateErpStockPayload,
} from "@/lib/erp";
import type { ErpStockUpdate } from "@/lib/types";

const upd = (over: Partial<ErpStockUpdate>): ErpStockUpdate => ({
  externalId: over.externalId ?? "EXT-1",
  productId: over.productId ?? "p1",
  stock: over.stock ?? 100,
  unitPrice: over.unitPrice ?? 30000,
  version: over.version ?? 2,
});

describe("reconcileStockUpdate (idempotent + conflict)", () => {
  const current = { version: 1, stock: 50, unit_price: 29000 };

  it("applies a newer version", () => {
    const r = reconcileStockUpdate(current, upd({ version: 2, stock: 80 }));
    expect(r.apply).toBe(true);
    expect(r.reason).toBe("applied");
    expect(r.next?.stock).toBe(80);
    expect(r.next?.version).toBe(2);
  });

  it("is a no-op for the same version (idempotent replay)", () => {
    expect(reconcileStockUpdate(current, upd({ version: 1 })).reason).toBe("noop");
  });

  it("rejects a stale (older) version", () => {
    const r = reconcileStockUpdate({ ...current, version: 5 }, upd({ version: 3 }));
    expect(r.apply).toBe(false);
    expect(r.reason).toBe("stale");
  });
});

describe("dedupeByExternalId", () => {
  it("keeps the highest version per external id", () => {
    const out = dedupeByExternalId([
      upd({ externalId: "A", version: 1 }),
      upd({ externalId: "A", version: 3 }),
      upd({ externalId: "B", version: 2 }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((u) => u.externalId === "A")?.version).toBe(3);
  });
});

describe("filterPosForErp (outbound pull)", () => {
  const pos = [
    { id: "1", supplier_id: "s1", created_at: "2026-06-01T00:00:00Z" },
    { id: "2", supplier_id: "s2", created_at: "2026-06-02T00:00:00Z" },
    { id: "3", supplier_id: "s1", created_at: "2026-06-03T00:00:00Z" },
  ];
  it("returns the supplier's POs after the last sync", () => {
    const out = filterPosForErp(pos, "s1", "2026-06-02T00:00:00Z");
    expect(out.map((p) => p.id)).toEqual(["3"]);
  });
  it("returns all of the supplier's POs without a since cursor", () => {
    expect(filterPosForErp(pos, "s1").map((p) => p.id)).toEqual(["1", "3"]);
  });
});

describe("validateErpStockPayload", () => {
  it("accepts valid payloads and rejects bad ones", () => {
    expect(validateErpStockPayload(upd({})).ok).toBe(true);
    expect(validateErpStockPayload({ externalId: "X" }).ok).toBe(false);
    expect(validateErpStockPayload({ ...upd({}), stock: -1 }).ok).toBe(false);
  });
});
