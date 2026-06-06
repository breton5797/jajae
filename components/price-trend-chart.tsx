import type { PriceTrendPoint } from "@/lib/types";
import { formatKRW } from "@/lib/utils";

/** Dependency-free inline SVG line chart for a price trend. Server-safe. */
export function PriceTrendChart({
  points,
  width = 320,
  height = 120,
}: {
  points: PriceTrendPoint[];
  width?: number;
  height?: number;
}) {
  if (points.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        가격 이력이 없습니다.
      </p>
    );
  }

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const pad = 10;

  const x = (i: number) =>
    points.length === 1
      ? width / 2
      : pad + (i * (width - 2 * pad)) / (points.length - 1);
  const y = (price: number) =>
    height - pad - ((price - min) / range) * (height - 2 * pad);

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`)
    .join(" ");

  const first = points[0];
  const last = points[points.length - 1];
  const delta = first && last ? last.price - first.price : 0;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="가격 추이 차트"
      >
        <path d={path} fill="none" stroke="#1A56DB" strokeWidth={2} />
        {points.map((p, i) => (
          <circle key={p.date + i} cx={x(i)} cy={y(p.price)} r={2.5} fill="#1A56DB" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>
          {first?.date} · {first ? formatKRW(first.price) : "-"}
        </span>
        <span className={delta > 0 ? "text-destructive" : "text-success"}>
          {delta > 0 ? "▲" : delta < 0 ? "▼" : "–"} {formatKRW(Math.abs(delta))}
        </span>
        <span>
          {last?.date} · {last ? formatKRW(last.price) : "-"}
        </span>
      </div>
    </div>
  );
}
