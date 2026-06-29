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

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { addObject, emptyScene, removeObject } from "@/lib/studio/scene";
import { presetForDomain } from "@/lib/studio/presets";
import { floorPlanToDesignScene } from "@/lib/studio/from-estimate";
import { AssetPalette } from "@/components/studio/asset-palette";
import { ObjectInspector } from "@/components/studio/object-inspector";
import { Toolbar, type TransformMode } from "@/components/studio/toolbar";
import { AiPreview, type AiPreviewState } from "@/components/studio/ai-preview";
import { SceneLibrary } from "@/components/studio/scene-library";
import { exportGLB } from "@/lib/studio/export/gltf";
import { exportOBJ } from "@/lib/studio/export/obj";
import { exportSTL } from "@/lib/studio/export/stl";
import { exportPNG, type ThreeCtx } from "@/lib/studio/export/snapshot";
import { downloadBlob } from "@/lib/studio/export/download";
import type { DesignScene, FloorPlan, StudioDomain } from "@/lib/types";
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
  const [aiState, setAiState] = useState<AiPreviewState>({ open: false, loading: false });
  const [libraryOpen, setLibraryOpen] = useState(false);

  /**
   * Holds the three.js context once the Canvas is ready.
   * Populated by the onReady callback forwarded to SceneCanvas.
   */
  const threeCtxRef = useRef<ThreeCtx | null>(null);

  // ── 견적 → 스튜디오 시드 ────────────────────────────────────────────────────
  // ?from=estimate&id=... 진입 시 견적 평면도로 초기 씬을 구성한다.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("from") !== "estimate") return;
    const id = params.get("id");
    if (!id) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/estimate/${id}`);
        if (!res.ok) return;
        const json = (await res.json()) as { floorPlan?: FloorPlan };
        if (!cancelled && json.floorPlan) {
          setScene(floorPlanToDesignScene(json.floorPlan));
          setSelectedId(null);
        }
      } catch {
        // 시드 실패 시 빈 씬 유지
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ── AI 실사 프리뷰 (Phase E) ──────────────────────────────────────────────────

  const handleAIRender = useCallback(async () => {
    const ctx = threeCtxRef.current;
    if (!ctx) return;
    const imageBase64 = exportPNG(ctx);
    setAiState({ open: true, loading: true });
    try {
      const res = await fetch("/api/studio/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, domain: scene.domain }),
      });
      if (!res.ok) {
        setAiState({
          open: true,
          loading: false,
          error: res.status === 401 ? "로그인이 필요합니다." : "AI 렌더 요청에 실패했습니다.",
        });
        return;
      }
      const json = (await res.json()) as { imageUrl?: string; note?: string };
      setAiState({ open: true, loading: false, imageUrl: json.imageUrl, note: json.note });
    } catch {
      setAiState({ open: true, loading: false, error: "AI 렌더 처리 중 오류가 발생했습니다." });
    }
  }, [scene.domain]);

  const closeAiPreview = useCallback(() => {
    setAiState({ open: false, loading: false });
  }, []);

  // ── 저장 / 불러오기 (Phase F) ─────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    const name = window.prompt("디자인 이름을 입력하세요", `${scene.domain} 시안`);
    if (!name) return;
    try {
      const res = await fetch("/api/studio/scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, domain: scene.domain, scene }),
      });
      if (res.status === 401) {
        window.alert("저장하려면 로그인이 필요합니다.");
        return;
      }
      window.alert(res.ok ? "저장했습니다." : "저장에 실패했습니다.");
    } catch {
      window.alert("저장 중 오류가 발생했습니다.");
    }
  }, [scene]);

  const handleLoadScene = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/studio/scenes/${id}`);
      if (!res.ok) return;
      const json = (await res.json()) as { scene?: DesignScene };
      if (json.scene) {
        setScene(json.scene);
        setSelectedId(null);
        setLibraryOpen(false);
      }
    } catch {
      // 로드 실패 시 현재 씬 유지
    }
  }, []);

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
        onAIRender={handleAIRender}
        onSave={handleSave}
        onOpenLibrary={() => setLibraryOpen(true)}
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

      {/* ── Overlays (AI 실사 / 내 디자인) ───────────────────────────── */}
      <AiPreview {...aiState} onClose={closeAiPreview} />
      <SceneLibrary
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onLoad={handleLoadScene}
      />
    </div>
  );
}
