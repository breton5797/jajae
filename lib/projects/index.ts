/**
 * lib/projects — 현장(site) budget & schedule intelligence. Pure; lib/types only.
 */
import type {
  Order,
  OrderTimelinePoint,
  ScheduleProgress,
  SiteBudget,
  SiteTask,
} from "@/lib/types";

/** Budget vs actual spend for a site, given that site's orders. */
export function computeSiteBudget(
  budget: number,
  siteOrders: Array<Pick<Order, "total" | "status">>,
): SiteBudget {
  const spent = siteOrders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + o.total, 0);
  const remaining = budget - spent;
  const burnRatio = budget > 0 ? Math.round((spent / budget) * 100) / 100 : 0;
  return {
    budget,
    spent,
    remaining,
    burnRatio,
    overBudget: spent > budget && budget > 0,
  };
}

/** Order spend timeline (chronological) with running cumulative total. */
export function buildOrderTimeline(
  siteOrders: Array<Pick<Order, "id" | "total" | "status" | "created_at">>,
): OrderTimelinePoint[] {
  const sorted = [...siteOrders]
    .filter((o) => o.status !== "cancelled")
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

  let cumulative = 0;
  return sorted.map((o) => {
    cumulative += o.total;
    return {
      orderId: o.id,
      date: o.created_at.slice(0, 10),
      amount: o.total,
      cumulative,
    };
  });
}

/** Schedule completion summary + the next pending task by planned date. */
export function scheduleProgress(tasks: SiteTask[]): ScheduleProgress {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;

  const pending = tasks
    .filter((t) => !t.done)
    .sort((a, b) => {
      const ad = a.planned_date ?? "9999-12-31";
      const bd = b.planned_date ?? "9999-12-31";
      return ad < bd ? -1 : ad > bd ? 1 : 0;
    });

  return {
    total,
    done,
    ratio: total > 0 ? Math.round((done / total) * 100) / 100 : 0,
    nextTask: pending[0] ?? null,
  };
}
