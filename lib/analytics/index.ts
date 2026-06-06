/**
 * lib/analytics — owner KPI computation. Pure; lib/types + utils.
 */
import type { AnalyticsResult, SupplierPerf } from "@/lib/types";
import { won, forecastAccuracy } from "@/lib/utils";

export interface AnalyticsOrderInput {
  contractor_id: string;
  total: number;
  platform_fee: number;
  status: string;
}

export interface AnalyticsItemInput {
  is_pb: boolean;
  unit_price_snapshot: number;
  cost: number | null;
  qty: number;
  supplier_id: string;
}

const COUNTED = new Set(["paid", "partially_fulfilled", "fulfilled"]);

export function computeAnalytics(
  period: string,
  input: {
    orders: AnalyticsOrderInput[];
    items: AnalyticsItemInput[];
    forecastPairs?: Array<{ predicted: number; actual: number }>;
  },
): AnalyticsResult {
  const orders = input.orders.filter((o) => COUNTED.has(o.status));

  const gmv = won(orders.reduce((s, o) => s + o.total, 0));
  const platformRevenue = orders.reduce((s, o) => s + o.platform_fee, 0);

  let pbValue = 0;
  let pbMargin = 0;
  let totalValue = 0;
  const supplierMap = new Map<string, SupplierPerf>();

  for (const it of input.items) {
    const lineValue = it.unit_price_snapshot * it.qty;
    totalValue += lineValue;
    if (it.is_pb) {
      pbValue += lineValue;
      pbMargin += (it.unit_price_snapshot - (it.cost ?? 0)) * it.qty;
    }
    const cur = supplierMap.get(it.supplier_id) ?? {
      supplierId: it.supplier_id,
      orders: 0,
      value: 0,
    };
    supplierMap.set(it.supplier_id, {
      ...cur,
      orders: cur.orders + 1,
      value: cur.value + lineValue,
    });
  }

  const margin = won(platformRevenue + pbMargin);
  const pbShare = totalValue > 0 ? Math.round((pbValue / totalValue) * 100) / 100 : 0;

  // repeat rate = contractors with >=2 counted orders / contractors with >=1
  const ordersByContractor = new Map<string, number>();
  for (const o of orders) {
    ordersByContractor.set(
      o.contractor_id,
      (ordersByContractor.get(o.contractor_id) ?? 0) + 1,
    );
  }
  const active = ordersByContractor.size;
  const repeat = [...ordersByContractor.values()].filter((c) => c >= 2).length;
  const repeatRate = active > 0 ? Math.round((repeat / active) * 100) / 100 : 0;

  const supplierPerf = [...supplierMap.values()].sort((a, b) => b.value - a.value);

  return {
    period,
    gmv,
    margin,
    pbShare,
    repeatRate,
    forecastAccuracy: forecastAccuracy(input.forecastPairs ?? []),
    supplierPerf,
  };
}
