"use client";

/**
 * components/studio/object-inspector.tsx
 * Right-side panel: edits the selected SceneObject's transform / color.
 * Emits immutable scene updates via parent callbacks.
 */

import type { DesignScene, SceneObject, Transform3D } from "@/lib/types";
import { updateObject, removeObject } from "@/lib/studio/scene";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ObjectInspectorProps {
  scene: DesignScene;
  selectedId: string | null;
  onChange: (scene: DesignScene) => void;
  onDeselect: () => void;
}

// ─── Sub-component: numeric XYZ row ──────────────────────────────────────────

type Axis = "x" | "y" | "z";
const AXES: Axis[] = ["x", "y", "z"];

function TransformRow({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: [number, number, number];
  step: number;
  onChange: (axis: Axis, raw: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="grid grid-cols-3 gap-1">
        {AXES.map((axis, i) => (
          <div key={axis}>
            <label className="mb-0.5 block text-xs text-muted-foreground">
              {axis.toUpperCase()}
            </label>
            <input
              type="number"
              value={parseFloat((value[i as 0 | 1 | 2]).toFixed(3))}
              step={step}
              onChange={(e) => onChange(axis, e.target.value)}
              className="w-full rounded border border-hairline bg-paper px-1.5 py-1 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ObjectInspector({
  scene,
  selectedId,
  onChange,
  onDeselect,
}: ObjectInspectorProps) {
  const obj: SceneObject | null =
    scene.objects.find((o) => o.id === selectedId) ?? null;

  if (!obj) {
    return (
      <aside
        className="flex w-52 flex-col border-l border-hairline bg-paper p-4"
        aria-label="오브젝트 인스펙터"
      >
        <p className="text-xs font-semibold text-muted-foreground">인스펙터</p>
        <p className="mt-2 text-xs text-muted-foreground">
          오브젝트를 선택하면<br />여기에서 편집할 수 있습니다.
        </p>
      </aside>
    );
  }

  function handleTransformChange(
    axis: Axis,
    field: keyof Transform3D,
    raw: string,
  ) {
    const value = parseFloat(raw);
    if (isNaN(value)) return;

    const idx = axis === "x" ? 0 : axis === "y" ? 1 : 2;
    const current = [...obj!.transform[field]] as [number, number, number];
    current[idx] = value;

    onChange(
      updateObject(scene, obj!.id, {
        transform: { ...obj!.transform, [field]: current },
      }),
    );
  }

  function handleColorChange(value: string) {
    onChange(updateObject(scene, obj!.id, { color: value }));
  }

  function handleDelete() {
    onChange(removeObject(scene, obj!.id));
    onDeselect();
  }

  return (
    <aside
      className="flex w-52 flex-col overflow-y-auto border-l border-hairline bg-paper"
      aria-label="오브젝트 인스펙터"
    >
      {/* Header */}
      <div className="border-b border-hairline px-3 py-2">
        <p className="text-xs font-semibold text-muted-foreground">인스펙터</p>
        <p className="truncate text-sm font-medium text-ink">{obj.name}</p>
      </div>

      <div className="flex flex-col gap-4 p-3">
        {/* Position */}
        <TransformRow
          label="위치"
          value={obj.transform.position}
          step={0.1}
          onChange={(axis, raw) => handleTransformChange(axis, "position", raw)}
        />

        {/* Rotation */}
        <TransformRow
          label="회전 (rad)"
          value={obj.transform.rotation}
          step={0.05}
          onChange={(axis, raw) => handleTransformChange(axis, "rotation", raw)}
        />

        {/* Scale */}
        <TransformRow
          label="크기"
          value={obj.transform.scale}
          step={0.1}
          onChange={(axis, raw) => handleTransformChange(axis, "scale", raw)}
        />

        {/* Color */}
        <div>
          <label
            htmlFor="obj-color"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            색상
          </label>
          <input
            id="obj-color"
            type="color"
            value={obj.color ?? "#6366f1"}
            onChange={(e) => handleColorChange(e.target.value)}
            className="h-8 w-full cursor-pointer rounded border border-hairline"
          />
        </div>

        {/* Delete */}
        <button
          type="button"
          onClick={handleDelete}
          className="mt-1 rounded-md border border-destructive px-3 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          삭제
        </button>
      </div>
    </aside>
  );
}
