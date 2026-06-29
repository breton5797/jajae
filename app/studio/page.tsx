"use client";

/**
 * app/studio/page.tsx
 * 3D 스튜디오 — Phase D editor
 *
 * Layout: top Toolbar → center row (AssetPalette | SceneCanvas | ObjectInspector)
 *
 * In-memory scene state only (persistence is Phase F).
 * Domain switch applies preset camera + ground via presetForDomain().
 * All scene mutations use lib/studio/scene immutable ops.
 *
 * Phase D: captures the three.js context via onReady and wires
 * glTF / OBJ / STL / PNG export handlers to Toolbar.
 */

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { addObject, emptyScene, removeObject } from "@/lib/studio/scene";
import { presetForDomain } from "@/lib/studio/presets";
import { AssetPalette } from "@/components/studio/asset-palette";
import { ObjectInspector } from "@/components/studio/object-inspector";
import { Toolbar, type TransformMode } from "@/components/studio/toolbar";
import { exportGLB } from "@/lib/studio/export/gltf";
import { exportOBJ } from "@/lib/studio/export/obj";
import { exportSTL } from "@/lib/studio/export/stl";
import { exportPNG, type ThreeCtx } from "@/lib/studio/export/snapshot";
import { downloadBlob } from "@/lib/studio/export/download";
import type { DesignScene, StudioDomain } from "@/lib/types";
import type { StudioAsset } from "@/lib/studio/assets";
import type { SceneCanvasProps } from "@/components/studio/scene-canvas";

// ─── Dynamic import (SSR guard for three.js / WebGL) ─────────────────────────

const SceneCanvas = dynamic<SceneCanvasProps>(
  () =>
    import("@/components/studio/scene-canvas").then((m) => m.SceneCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-paper text-sm text-muted-foreground">
        3D 스튜디오 로딩 중…
      </div>
    ),
  },
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a fresh DesignScene for the given domain, applying its preset. */
function buildScene(domain: StudioDomain): DesignScene {
  const preset = presetForDomain(domain);
  return {
    ...emptyScene(domain),
    camera: preset.camera,
    ground: preset.ground,
  };
}

/** Derive a safe filename stem from the current domain. */
function stemFor(domain: StudioDomain): string {
  return `studio-${domain}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudioPage() {
  const [scene, setScene] = useState<DesignScene>(() =>
    buildScene("interior"),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");

  /**
   * Holds the three.js context once the Canvas is ready.
   * Populated by the onReady callback forwarded to SceneCanvas.
   */
  const threeCtxRef = useRef<ThreeCtx | null>(null);

  // ── three.js context bridge ──────────────────────────────────────────────────

  const handleCanvasReady = useCallback((ctx: ThreeCtx) => {
    threeCtxRef.current = ctx;
  }, []);

  // ── Export handlers ──────────────────────────────────────────────────────────

  const handleExportGLB = useCallback(async () => {
    const ctx = threeCtxRef.current;
    if (!ctx) return;
    const blob = await exportGLB(ctx.scene);
    downloadBlob(blob, `${stemFor(scene.domain)}.glb`);
  }, [scene.domain]);

  const handleExportOBJ = useCallback(() => {
    const ctx = threeCtxRef.current;
    if (!ctx) return;
    const text = exportOBJ(ctx.scene);
    downloadBlob(new Blob([text], { type: "text/plain" }), `${stemFor(scene.domain)}.obj`);
  }, [scene.domain]);

  const handleExportSTL = useCallback(() => {
    const ctx = threeCtxRef.current;
    if (!ctx) return;
    const text = exportSTL(ctx.scene);
    downloadBlob(new Blob([text], { type: "text/plain" }), `${stemFor(scene.domain)}.stl`);
  }, [scene.domain]);

  const handleExportPNG = useCallback(() => {
    const ctx = threeCtxRef.current;
    if (!ctx) return;
    const dataUrl = exportPNG(ctx);
    downloadBlob(dataUrl, `${stemFor(scene.domain)}.png`);
  }, [scene.domain]);

  // ── Scene handlers ───────────────────────────────────────────────────────────

  /**
   * Domain switch: apply preset camera + ground, clear objects, clear selection.
   */
  function handleDomainChange(domain: StudioDomain) {
    setScene(buildScene(domain));
    setSelectedId(null);
  }

  /**
   * Add a new asset to the scene.
   * Groups have parts with built-in Y offsets, so group position starts at y=0.
   * X is staggered so multiple drops don't stack.
   */
  function handleAddAsset(asset: StudioAsset) {
    setScene((prev) =>
      addObject(prev, asset.id, asset.label, {
        position: [prev.objects.length * 2, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      }),
    );
  }

  /**
   * Stable callback — avoids recreating handleDragEnd in SceneCanvas on
   * every render (setScene from useState is stable across renders).
   */
  const handleSceneChange = useCallback((updated: DesignScene) => {
    setScene(updated);
  }, []);

  const handleDeselect = useCallback(() => {
    setSelectedId(null);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col bg-paper">
      {/* ── Top toolbar ──────────────────────────────────────────────── */}
      <Toolbar
        domain={scene.domain}
        transformMode={transformMode}
        onDomainChange={handleDomainChange}
        onTransformModeChange={setTransformMode}
        onExportGLB={handleExportGLB}
        onExportOBJ={handleExportOBJ}
        onExportSTL={handleExportSTL}
        onExportPNG={handleExportPNG}
      />

      {/* ── Main editor row ──────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: asset palette */}
        <AssetPalette domain={scene.domain} onAdd={handleAddAsset} />

        {/* Center: 3D canvas */}
        <main className="relative flex-1 overflow-hidden">
          <SceneCanvas
            scene={scene}
            selectedId={selectedId}
            transformMode={transformMode}
            onSelect={setSelectedId}
            onChange={handleSceneChange}
            onReady={handleCanvasReady}
          />

          {/* Object count badge */}
          <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-paper/80 px-2 py-1 text-xs text-muted-foreground backdrop-blur-sm">
            오브젝트 {scene.objects.length}개
          </div>
        </main>

        {/* Right: object inspector */}
        <ObjectInspector
          scene={scene}
          selectedId={selectedId}
          onChange={handleSceneChange}
          onDeselect={handleDeselect}
        />
      </div>
    </div>
  );
}
