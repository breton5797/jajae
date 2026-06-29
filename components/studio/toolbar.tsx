"use client";

/**
 * components/studio/toolbar.tsx
 * Top bar for the 3D Studio:
 *  - Domain <select> (triggers preset switch in parent)
 *  - Transform mode toggle (이동 / 회전 / 크기)
 *  - Export buttons: glTF / OBJ / STL / PNG (wired in Phase D)
 */

import type { StudioDomain } from "@/lib/types";
import { PRESETS } from "@/lib/studio/presets";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TransformMode = "translate" | "rotate" | "scale";

export interface ToolbarProps {
  domain: StudioDomain;
  transformMode: TransformMode;
  onDomainChange: (domain: StudioDomain) => void;
  onTransformModeChange: (mode: TransformMode) => void;
  /** Phase D export handlers — undefined = button is disabled */
  onExportGLB?: () => void;
  onExportOBJ?: () => void;
  onExportSTL?: () => void;
  onExportPNG?: () => void;
  /** Phase E/F action handlers — undefined = button hidden */
  onAIRender?: () => void;
  onSave?: () => void;
  onOpenLibrary?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DOMAIN_OPTIONS = (Object.values(PRESETS) as (typeof PRESETS)[StudioDomain][]).map(
  (p) => ({ value: p.domain, label: p.label }),
);

const TRANSFORM_MODES: { mode: TransformMode; label: string }[] = [
  { mode: "translate", label: "이동" },
  { mode: "rotate", label: "회전" },
  { mode: "scale", label: "크기" },
];

type ExportEntry = {
  label: string;
  handlerKey: "onExportGLB" | "onExportOBJ" | "onExportSTL" | "onExportPNG";
};

const EXPORT_ENTRIES: ExportEntry[] = [
  { label: "glTF", handlerKey: "onExportGLB" },
  { label: "OBJ",  handlerKey: "onExportOBJ" },
  { label: "STL",  handlerKey: "onExportSTL" },
  { label: "PNG",  handlerKey: "onExportPNG" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function Toolbar({
  domain,
  transformMode,
  onDomainChange,
  onTransformModeChange,
  onExportGLB,
  onExportOBJ,
  onExportSTL,
  onExportPNG,
  onAIRender,
  onSave,
  onOpenLibrary,
}: ToolbarProps) {
  const handlers: Record<ExportEntry["handlerKey"], (() => void) | undefined> = {
    onExportGLB,
    onExportOBJ,
    onExportSTL,
    onExportPNG,
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-paper px-4 py-2">
      {/* Left: title + domain */}
      <div className="flex items-center gap-3">
        <h1 className="text-base font-bold text-brand-700">3D 스튜디오</h1>

        <select
          value={domain}
          onChange={(e) => onDomainChange(e.target.value as StudioDomain)}
          className="rounded-md border border-hairline bg-paper px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="도메인 선택"
        >
          {DOMAIN_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Right: actions + transform mode + export buttons */}
      <div className="flex items-center gap-3">
        {/* Phase E/F actions */}
        {(onAIRender || onSave || onOpenLibrary) && (
          <div className="flex items-center gap-1">
            {onAIRender && (
              <button
                type="button"
                onClick={onAIRender}
                className="rounded bg-brand px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-brand-700"
                title="현재 화면을 AI 실사로 변환"
              >
                AI 실사
              </button>
            )}
            {onSave && (
              <button
                type="button"
                onClick={onSave}
                className="rounded border border-hairline px-2.5 py-1 text-xs text-ink transition-colors hover:bg-muted"
              >
                저장
              </button>
            )}
            {onOpenLibrary && (
              <button
                type="button"
                onClick={onOpenLibrary}
                className="rounded border border-hairline px-2.5 py-1 text-xs text-ink transition-colors hover:bg-muted"
              >
                내 디자인
              </button>
            )}
          </div>
        )}

        {/* Transform mode toggle */}
        <div
          className="flex overflow-hidden rounded-md border border-hairline"
          role="group"
          aria-label="변환 모드"
        >
          {TRANSFORM_MODES.map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() => onTransformModeChange(mode)}
              aria-pressed={transformMode === mode}
              className={
                transformMode === mode
                  ? "bg-brand px-3 py-1.5 text-sm font-medium text-white"
                  : "bg-paper px-3 py-1.5 text-sm text-ink transition-colors hover:bg-muted"
              }
            >
              {label}
            </button>
          ))}
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">익스포트:</span>
          {EXPORT_ENTRIES.map(({ label, handlerKey }) => {
            const handler = handlers[handlerKey];
            const ready = handler !== undefined;
            return (
              <button
                key={label}
                type="button"
                onClick={ready ? handler : undefined}
                disabled={!ready}
                title={ready ? `${label} 내보내기` : `${label} 내보내기 (로딩 중)`}
                className={
                  ready
                    ? "rounded border border-hairline px-2 py-1 text-xs text-ink transition-colors hover:bg-muted"
                    : "cursor-not-allowed rounded border border-hairline px-2 py-1 text-xs text-muted-foreground opacity-50"
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
