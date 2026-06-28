"use client";

/**
 * components/studio/scene-canvas.tsx
 * r3f <Canvas> for the 3D Studio. Renders DesignScene objects with:
 *  - OrbitControls (makeDefault) for camera
 *  - TransformControls for move / rotate / scale of the selected object
 *
 * SSR safety: "use client" + loaded by the page via next/dynamic({ssr:false}).
 * Phase D will use the onReady ctx for glTF / OBJ / STL / PNG export.
 */

import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, TransformControls } from "@react-three/drei";
import { Suspense, useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import type { DesignScene } from "@/lib/types";
import { updateObject } from "@/lib/studio/scene";
import { assetById, type GeoPart } from "@/lib/studio/assets";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SceneCanvasProps {
  scene: DesignScene;
  selectedId: string | null;
  /** Default: "translate" */
  transformMode?: "translate" | "rotate" | "scale";
  onSelect: (id: string | null) => void;
  onChange: (scene: DesignScene) => void;
  /**
   * Called once after the three.js GL context is ready.
   * Phase D uses this to call GLTFExporter / gl.domElement.toDataURL etc.
   */
  onReady?: (ctx: {
    scene: THREE.Scene;
    gl: THREE.WebGLRenderer;
    camera: THREE.Camera;
  }) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_COLOR = "#6366f1"; // indigo — brand-ish placeholder
const GROUND_COLOR = "#d1d5db"; // neutral gray
const GROUND_ROTATION = [-Math.PI / 2, 0, 0] as [number, number, number];

/** Fallback parts when assetId is not found in the catalog. */
const FALLBACK_PARTS: GeoPart[] = [
  { prim: "box", size: [1, 1, 1], offset: [0, 0.5, 0] },
];

// ─── Geometry helper ──────────────────────────────────────────────────────────

/** Renders the correct three.js geometry for a single GeoPart. */
function PartGeometry({ part }: { part: GeoPart }) {
  switch (part.prim) {
    case "box":
      return (
        <boxGeometry args={[part.size[0] ?? 1, part.size[1] ?? 1, part.size[2] ?? 1]} />
      );
    case "cylinder":
      return (
        <cylinderGeometry
          args={[part.size[0] ?? 0.5, part.size[0] ?? 0.5, part.size[1] ?? 1, 16]}
        />
      );
    case "cone":
      return <coneGeometry args={[part.size[0] ?? 0.5, part.size[1] ?? 1, 16]} />;
    case "sphere":
      return <sphereGeometry args={[part.size[0] ?? 0.5, 16, 16]} />;
    case "plane":
      return <planeGeometry args={[part.size[0] ?? 1, part.size[1] ?? 1]} />;
    default:
      return <boxGeometry args={[1, 1, 1]} />;
  }
}

/** Single primitive mesh within an asset group. */
function PartMesh({
  part,
  isSelected,
  objColor,
}: {
  part: GeoPart;
  isSelected: boolean;
  objColor?: string;
}) {
  const color = part.color ?? objColor ?? DEFAULT_COLOR;
  const offset = part.offset ?? [0, 0, 0];

  return (
    <mesh position={offset}>
      <PartGeometry part={part} />
      <meshStandardMaterial
        color={color}
        emissive={isSelected ? "#ffffff" : "#000000"}
        emissiveIntensity={isSelected ? 0.15 : 0}
      />
    </mesh>
  );
}

// ─── Camera controller ───────────────────────────────────────────────────────

/**
 * Lives inside <Canvas>. Updates the three.js camera position whenever
 * scene.camera.position changes (e.g., domain switch via preset).
 * Deps are individual numbers to avoid stale array references.
 */
function CameraController({
  position,
}: {
  position: [number, number, number];
}) {
  const { camera } = useThree();
  const [px, py, pz] = position;

  useEffect(() => {
    camera.position.set(px, py, pz);
  }, [camera, px, py, pz]);

  return null;
}

// ─── Inner: bridge three.js context out to the parent (Phase D export) ───────

/**
 * Must live *inside* <Canvas> to call useThree().
 * Fires onReady exactly once after the GL context is ready.
 */
function ThreeBridge({
  onReady,
}: {
  onReady: SceneCanvasProps["onReady"];
}) {
  const { scene, gl, camera } = useThree();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current || !onReady) return;
    firedRef.current = true;
    onReady({ scene, gl, camera });
  }, [scene, gl, camera, onReady]);

  return null;
}

// ─── SceneCanvas ──────────────────────────────────────────────────────────────

export function SceneCanvas({
  scene,
  selectedId,
  transformMode = "translate",
  onSelect,
  onChange,
  onReady,
}: SceneCanvasProps) {
  /**
   * Stores refs to mounted THREE.Object3D (Group) objects, keyed by SceneObject.id.
   * Each scene object is rendered as a <group> with one mesh per GeoPart.
   * TransformControls attaches to the outer group so the whole asset moves together.
   */
  const meshMap = useRef<Record<string, THREE.Object3D | null>>({});

  /**
   * Stable value refs — used inside drag-end callback to avoid stale closures.
   */
  const sceneRef = useRef(scene);
  const selectedIdRef = useRef(selectedId);

  useEffect(() => {
    sceneRef.current = scene;
  });
  useEffect(() => {
    selectedIdRef.current = selectedId;
  });

  /**
   * Called when the TransformControls gizmo drag ends (onMouseUp).
   * Reads position/rotation/scale from the group (THREE.Object3D) and
   * emits one immutable scene update per gesture.
   */
  const handleDragEnd = useCallback(() => {
    const id = selectedIdRef.current;
    if (!id) return;
    const obj = meshMap.current[id];
    if (!obj) return;

    const position = obj.position.toArray() as [number, number, number];
    const rotation: [number, number, number] = [
      obj.rotation.x,
      obj.rotation.y,
      obj.rotation.z,
    ];
    const scale = obj.scale.toArray() as [number, number, number];

    onChange(
      updateObject(sceneRef.current, id, {
        transform: { position, rotation, scale },
      }),
    );
  }, [onChange]);

  const selectedObj =
    selectedId !== null ? (meshMap.current[selectedId] ?? null) : null;
  const showGround = scene.ground.type !== "none";

  return (
    <div className="h-full w-full" role="region" aria-label="3D 씬 에디터">
      <Canvas
        camera={{ position: scene.camera.position, fov: 50 }}
        gl={{ preserveDrawingBuffer: true }}
        onPointerMissed={() => onSelect(null)}
      >
        {/* Reactive camera position on domain switch */}
        <CameraController position={scene.camera.position} />

        {/* Phase D export hook */}
        <ThreeBridge onReady={onReady} />

        {/* ── Lighting ─────────────────────────────────────────────────── */}
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 15, 10]} intensity={0.8} />

        {/* ── Ground plane ─────────────────────────────────────────────── */}
        {showGround && (
          <mesh
            rotation={GROUND_ROTATION}
            position={[0, -0.01, 0]}
            onClick={() => onSelect(null)}
          >
            <planeGeometry args={[scene.ground.sizeM, scene.ground.sizeM]} />
            <meshStandardMaterial color={GROUND_COLOR} />
          </mesh>
        )}

        {/* ── Scene objects ─────────────────────────────────────────────── */}
        <Suspense fallback={null}>
          {scene.objects.map((obj) => {
            const isSelected = obj.id === selectedId;
            const parts = assetById(obj.assetId)?.parts ?? FALLBACK_PARTS;

            return (
              /**
               * Each scene object renders as a THREE.Group.
               * The group ref is stored in meshMap and passed to TransformControls
               * so the whole multi-part assembly moves/rotates/scales together.
               * onClick on the group propagates through all child meshes.
               */
              <group
                key={obj.id}
                ref={(el) => {
                  meshMap.current[obj.id] = el;
                }}
                position={obj.transform.position}
                rotation={obj.transform.rotation}
                scale={obj.transform.scale}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(obj.id);
                }}
              >
                {parts.map((part, i) => (
                  <PartMesh
                    key={i}
                    part={part}
                    isSelected={isSelected}
                    objColor={obj.color}
                  />
                ))}
              </group>
            );
          })}
        </Suspense>

        {/* ── TransformControls (only when an object is selected) ───────── */}
        {selectedId !== null && selectedObj !== null && (
          /**
           * Attaches to the outer group (THREE.Object3D).
           * drei TransformControls automatically disables OrbitControls
           * while a drag is active (makeDefault wiring).
           */
          <TransformControls
            object={selectedObj}
            mode={transformMode}
            onMouseUp={handleDragEnd}
          />
        )}

        {/*
         * makeDefault registers these controls as the R3F default controls.
         * TransformControls queries this to pause orbit while gizmo is active.
         */}
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}
