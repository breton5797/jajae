/**
 * lib/erp — supplier ERP sync: idempotent inbound stock/price reconciliation +
 * outbound PO pull. Pure; depends on lib/types + lib/utils only.
 */
import type { ErpStockUpdate, ReconcileResult } from "@/lib/types";
import { type Result, ok, err } from "@/lib/utils";

/**
 * Reconcile an inbound stock/price update against current product state by version.
 * Idempotent: an update at or below the current version is a no-op (stale/duplicate).
 */
export function reconcileStockUpdate(
  current: { version: number; stock: number; unit_price: number },
  incoming: ErpStockUpdate,
): ReconcileResult {
  if (incoming.version <= current.version) {
    return {
      apply: false,
      reason: incoming.version < current.version ? "stale" : "noop",
      next: null,
    };
  }
  return {
    apply: true,
    reason: "applied",
    next: {
      stock: Math.max(0, Math.trunc(incoming.stock)),
      unit_price: Math.max(0, incoming.unitPrice),
      version: incoming.version,
    },
  };
}

/** Dedupe inbound updates by externalId, keeping the highest version per id. */
export function dedupeByExternalId(
  updates: ErpStockUpdate[],
): ErpStockUpdate[] {
  const byId = new Map<string, ErpStockUpdate>();
  for (const u of updates) {
    const cur = byId.get(u.externalId);
    if (!cur || u.version > cur.version) byId.set(u.externalId, u);
  }
  return [...byId.values()];
}

/** Outbound: POs assigned to a supplier since the last sync timestamp. */
export function filterPosForErp<
  T extends { supplier_id: string; created_at: string },
>(pos: T[], supplierId: string, sinceTs?: string): T[] {
  return pos
    .filter((po) => po.supplier_id === supplierId)
    .filter((po) => !sinceTs || po.created_at > sinceTs)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
}

/** Validate an inbound ERP stock payload. */
export function validateErpStockPayload(raw: unknown): Result<ErpStockUpdate> {
  if (!raw || typeof raw !== "object") return err("payload must be an object");
  const r = raw as Record<string, unknown>;
  if (typeof r.externalId !== "string" || !r.externalId)
    return err("externalId required");
  if (typeof r.productId !== "string" || !r.productId)
    return err("productId required");
  if (typeof r.stock !== "number" || r.stock < 0)
    return err("stock must be a non-negative number");
  if (typeof r.unitPrice !== "number" || r.unitPrice < 0)
    return err("unitPrice must be a non-negative number");
  if (typeof r.version !== "number" || r.version < 1)
    return err("version must be a positive number");
  return ok({
    externalId: r.externalId,
    productId: r.productId,
    stock: r.stock,
    unitPrice: r.unitPrice,
    version: r.version,
  });
}
