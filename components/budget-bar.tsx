import type { SiteBudget } from "@/lib/types";
import { formatKRW, cn } from "@/lib/utils";

/** Budget vs actual spend bar. Server-safe. */
export function BudgetBar({ budget }: { budget: SiteBudget }) {
  const pct = Math.min(100, Math.max(0, Math.round(budget.burnRatio * 100)));
  const barColor = budget.overBudget
    ? "bg-destructive"
    : pct > 80
      ? "bg-warning"
      : "bg-brand";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">예산 소진</span>
        <span className="font-semibold">
          {formatKRW(budget.spent)} / {formatKRW(budget.budget)}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className={budget.overBudget ? "text-destructive" : "text-muted-foreground"}>
          {budget.overBudget
            ? `예산 초과 ${formatKRW(Math.abs(budget.remaining))}`
            : `잔여 ${formatKRW(budget.remaining)}`}
        </span>
        <span className="text-muted-foreground">{pct}%</span>
      </div>
    </div>
  );
}
