/**
 * components/estimate/floorplan-2d.tsx
 * Server component — pure SVG floor plan renderer.
 * No "use client" needed; no runtime hooks, no interactivity.
 */
import type { FloorPlan } from "@/lib/types";

const SCALE = 24; // pixels per meter
const PAD = 20; // SVG inner padding (px)
const DISCLAIMER_H = 16; // space for the bottom note

/** Pixel-snap to avoid sub-pixel blurring on integer grids. */
function px(v: number): number {
  return Math.round(v * SCALE);
}

export function FloorPlan2D({ plan }: { plan: FloorPlan }): JSX.Element {
  if (plan.rooms.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-hairline bg-paper text-sm text-muted-foreground">
        평면도 데이터가 없습니다
      </div>
    );
  }

  const svgW = Math.max(plan.widthM, 1) * SCALE + PAD * 2;
  const svgH = Math.max(plan.lengthM, 1) * SCALE + PAD * 2 + DISCLAIMER_H;

  return (
    <svg
      role="img"
      aria-label="개략 평면도 (스키매틱)"
      viewBox={`0 0 ${svgW} ${svgH}`}
      width="100%"
      style={{ maxHeight: 420 }}
      className="rounded-lg border border-hairline bg-paper"
    >
      {plan.rooms.map((room, i) => {
        const rx = px(room.x) + PAD;
        const ry = px(room.y) + PAD;
        const rw = px(room.w);
        const rh = px(room.h);
        const cx = rx + rw / 2;
        const cy = ry + rh / 2;

        return (
          <g key={i}>
            <rect
              x={rx}
              y={ry}
              width={rw}
              height={rh}
              fill="#FAFAF8"
              stroke="#1A56DB"
              strokeWidth={1.5}
            />
            <text
              x={cx}
              y={cy - 7}
              textAnchor="middle"
              fontSize={10}
              fill="#16181D"
              fontFamily="system-ui, sans-serif"
            >
              {room.name}
            </text>
            <text
              x={cx}
              y={cy + 8}
              textAnchor="middle"
              fontSize={8}
              fill="#6B7280"
              fontFamily="system-ui, sans-serif"
            >
              {room.w.toFixed(1)}×{room.h.toFixed(1)}m
            </text>
          </g>
        );
      })}
      <text
        x={svgW / 2}
        y={svgH - 4}
        textAnchor="middle"
        fontSize={8}
        fill="#9CA3AF"
        fontFamily="system-ui, sans-serif"
      >
        ※ 개략 평면도 (치수 기반 자동 배치)
      </text>
    </svg>
  );
}
