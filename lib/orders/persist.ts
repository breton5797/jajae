/**
 * Persistence for a split order. DB-agnostic via the SqlExecutor interface so
 * the SAME code runs against PGlite (tests) and any Postgres (Supabase).
 */
import type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  SplitResult,
  StagedDelivery,
} from "@/lib/types";

export interface SqlExecutor {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface PersistOrderInput {
  contractorId: string;
  siteId: string | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  tossPaymentKey?: string | null;
}

export interface PersistedOrder {
  orderId: string;
  poIds: string[];
}

/**
 * Insert order + per-supplier POs + order items + staged deliveries.
 * Returns generated ids. Caller is responsible for transaction boundaries.
 */
export async function persistOrder(
  db: SqlExecutor,
  input: PersistOrderInput,
  split: SplitResult,
  stages: StagedDelivery[],
): Promise<PersistedOrder> {
  const orderRes = await db.query<{ id: string }>(
    `INSERT INTO orders
       (contractor_id, site_id, status, payment_method, payment_status,
        subtotal, platform_fee, total, toss_payment_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      input.contractorId,
      input.siteId,
      input.orderStatus,
      input.paymentMethod,
      input.paymentStatus,
      split.subtotal,
      split.platformFee,
      split.total,
      input.tossPaymentKey ?? null,
    ],
  );
  const orderId = orderRes.rows[0]?.id;
  if (!orderId) throw new Error("Failed to insert order");

  const poIds: string[] = [];

  for (const po of split.purchaseOrders) {
    const poRes = await db.query<{ id: string }>(
      `INSERT INTO purchase_orders
         (order_id, supplier_id, status, subtotal, platform_fee, expected_ship_date)
       VALUES ($1,$2,'pending',$3,$4,$5)
       RETURNING id`,
      [orderId, po.supplierId, po.subtotal, po.platformFee, po.expectedShipDate],
    );
    const poId = poRes.rows[0]?.id;
    if (!poId) throw new Error("Failed to insert purchase_order");
    poIds.push(poId);

    for (const it of po.items) {
      await db.query(
        `INSERT INTO order_items
           (po_id, product_id, name_snapshot, unit_price_snapshot, qty,
            line_total, backordered)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          poId,
          it.productId,
          it.name,
          it.unitPrice,
          it.qty,
          it.lineTotal,
          it.backordered,
        ],
      );
    }
  }

  for (const stage of stages) {
    const poId = poIds[stage.poIndex];
    if (!poId) continue;
    await db.query(
      `INSERT INTO deliveries
         (po_id, site_id, status, scheduled_date)
       VALUES ($1,$2,'scheduled',$3)`,
      [poId, input.siteId, stage.scheduledDate],
    );
  }

  return { orderId, poIds };
}
