/**
 * lib/orders — consolidated multi-supplier cart → per-supplier purchase orders.
 *
 * Pure, deterministic. Handles:
 *  - splitting a cross-category, multi-supplier cart into one PO per supplier
 *  - partial stockout (split fulfilled vs backordered qty)
 *  - mixed lead-times → staged delivery groups
 *
 * Depends only on lib/types and lib/utils (boundary-enforced).
 */
import type {
  ResolvedCartLine,
  SplitOrderItem,
  SplitPurchaseOrder,
  SplitResult,
  StagedDelivery,
} from "@/lib/types";
import { addDays, won } from "@/lib/utils";

/** Days added to a product's lead time to restock a backordered quantity. */
export const BACKORDER_RESTOCK_DAYS = 14;

/**
 * Split a resolved cart into per-supplier purchase orders.
 * @param lines    cart lines resolved against current product data
 * @param feeRate  platform fee rate (0..1)
 * @param orderDate ISO date (YYYY-MM-DD) the order is placed
 */
export function splitCartIntoPurchaseOrders(
  lines: ResolvedCartLine[],
  feeRate: number,
  orderDate: string,
): SplitResult {
  if (lines.length === 0) {
    return {
      purchaseOrders: [],
      subtotal: 0,
      platformFee: 0,
      total: 0,
      hasBackorder: false,
    };
  }

  // Group items by supplier (immutably).
  const bySupplier = new Map<string, SplitOrderItem[]>();

  for (const line of lines) {
    if (line.requestedQty <= 0) continue;
    const { product, requestedQty } = line;
    const fulfilledQty = Math.max(0, Math.min(requestedQty, product.stock));
    const backorderedQty = requestedQty - fulfilledQty;
    const lineTotal = won(product.unit_price * requestedQty);

    const item: SplitOrderItem = {
      productId: product.id,
      name: product.name,
      unitPrice: product.unit_price,
      qty: requestedQty,
      fulfilledQty,
      backorderedQty,
      lineTotal,
      backordered: backorderedQty > 0,
      unit: product.unit,
      leadTimeDays: product.lead_time_days,
    };

    const existing = bySupplier.get(product.supplier_id) ?? [];
    bySupplier.set(product.supplier_id, [...existing, item]);
  }

  const purchaseOrders: SplitPurchaseOrder[] = [];

  // Deterministic supplier ordering for stable output.
  const supplierIds = [...bySupplier.keys()].sort();

  for (const supplierId of supplierIds) {
    const items = bySupplier.get(supplierId) ?? [];
    const subtotal = items.reduce((sum, it) => sum + it.lineTotal, 0);
    const platformFee = won(subtotal * feeRate);

    // First-stage ship date is the longest lead time among IN-STOCK items.
    const inStockLeads = items
      .filter((it) => it.fulfilledQty > 0)
      .map((it) => it.leadTimeDays);
    const backorderLeads = items
      .filter((it) => it.backorderedQty > 0)
      .map((it) => it.leadTimeDays + BACKORDER_RESTOCK_DAYS);
    const allLeads = [...inStockLeads, ...backorderLeads];
    const maxLeadTimeDays = allLeads.length > 0 ? Math.max(...allLeads) : 0;
    const firstLead =
      inStockLeads.length > 0
        ? Math.max(...inStockLeads)
        : Math.max(0, ...backorderLeads);

    purchaseOrders.push({
      supplierId,
      items,
      subtotal,
      platformFee,
      maxLeadTimeDays,
      expectedShipDate: addDays(orderDate, firstLead),
    });
  }

  const subtotal = purchaseOrders.reduce((s, po) => s + po.subtotal, 0);
  const platformFee = purchaseOrders.reduce((s, po) => s + po.platformFee, 0);
  const hasBackorder = purchaseOrders.some((po) =>
    po.items.some((it) => it.backordered),
  );

  return {
    purchaseOrders,
    subtotal,
    platformFee,
    total: subtotal + platformFee,
    hasBackorder,
  };
}

/**
 * Build staged delivery groups for a split order.
 * Items sharing a (leadTime, isBackorder) window ship together.
 */
export function buildStagedDeliveries(
  split: SplitResult,
  orderDate: string,
): StagedDelivery[] {
  const stages: StagedDelivery[] = [];

  split.purchaseOrders.forEach((po, poIndex) => {
    // window key -> { leadTimeDays, isBackorder, productIds }
    const windows = new Map<
      string,
      { leadTimeDays: number; isBackorder: boolean; productIds: string[] }
    >();

    const pushWindow = (
      leadTimeDays: number,
      isBackorder: boolean,
      productId: string,
    ) => {
      const key = `${leadTimeDays}:${isBackorder ? "b" : "s"}`;
      const cur = windows.get(key);
      if (cur) {
        windows.set(key, { ...cur, productIds: [...cur.productIds, productId] });
      } else {
        windows.set(key, { leadTimeDays, isBackorder, productIds: [productId] });
      }
    };

    for (const it of po.items) {
      if (it.fulfilledQty > 0) pushWindow(it.leadTimeDays, false, it.productId);
      if (it.backorderedQty > 0)
        pushWindow(
          it.leadTimeDays + BACKORDER_RESTOCK_DAYS,
          true,
          it.productId,
        );
    }

    const sortedWindows = [...windows.values()].sort(
      (a, b) => a.leadTimeDays - b.leadTimeDays,
    );

    for (const w of sortedWindows) {
      stages.push({
        supplierId: po.supplierId,
        poIndex,
        scheduledDate: addDays(orderDate, w.leadTimeDays),
        leadTimeDays: w.leadTimeDays,
        productIds: w.productIds,
        isBackorder: w.isBackorder,
      });
    }
  });

  return stages;
}
