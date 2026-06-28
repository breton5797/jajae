"use client";

/**
 * components/proposal/proposal-canvas.tsx
 * r3f 3D 제안 렌더 — FurnishedScene의 방/벽(마감 색 틴트) + 가구 GeoPart.
 *
 * SSR safety: "use client" + proposal-sheet.tsx 에서 next/dynamic({ ssr:false })로 로드.
 * preserveDrawingBuffer: true → exportPNG 스냅샷 신뢰성 보장.
 */

import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useEffect } from "react";
import type { FurnishedScene, PlacedAsset } from "@/lib/studio/from-floorplan";
import type { GeoPart } from "@/lib/studio/assets";
import { exportPNG } from "@/lib/studio/export/snapshot";

const WALL_H = 2.4;
const WALL_T = 0.1;
const FURNITURE_COLOR = "#9A8C7A";

function Part({ part, color }: { part: GeoPart; color: string }) {
  const [ox, oy, oz] = part.offset ?? [0, 0, 0];
  const c = part.color ?? color;
  return (
    <mesh position={[ox, oy, oz]}>
      {part.prim === "box" && (
        <boxGeometry args={[part.size[0], part.size[1], part.size[2]]} />
      )}
      {part.prim === "cylinder" && (
        <cylinderGeometry args={[part.size[0], part.size[0], part.size[1], 16]} />
      )}
      {part.prim === "cone" && (
        <coneGeometry args={[part.size[0], part.size[1], 16]} />
      )}
      {part.prim === "sphere" && <sphereGeometry args={[part.size[0], 16, 16]} />}
      {part.prim === "plane" && (
        <planeGeometry args={[part.size[0], part.size[1]]} />
      )}
      <meshStandardMaterial color={c} />
    </mesh>
  );
}

function Furniture({
  item,
  cx,
  cz,
}: {
  item: PlacedAsset;
  cx: number;
  cz: number;
}) {
  const [x, , z] = item.transform.position;
  return (
    <group position={[x - cx, 0, z - cz]} rotation={item.transform.rotation}>
      {item.asset.parts.map((p, i) => (
        <Part key={i} part={p} color={FURNITURE_COLOR} />
      ))}
    </group>
  );
}

function Snapshotter({ onSnapshot }: { onSnapshot?: (d: string) => void }) {
  const { scene, gl, camera } = useThree();
  useEffect(() => {
    if (!onSnapshot) return;
    const id = setTimeout(
      () => onSnapshot(exportPNG({ scene, gl, camera })),
      600,
    );
    return () => clearTimeout(id);
  }, [onSnapshot, scene, gl, camera]);
  return null;
}

export function ProposalCanvas({
  scene,
  onSnapshot,
}: {
  scene: FurnishedScene;
  onSnapshot?: (d: string) => void;
}) {
  const cx = scene.widthM / 2;
  const cz = scene.lengthM / 2;
  const dist = Math.max(scene.widthM, scene.lengthM, 6) * 1.5;

  return (
    <div
      className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-hairline bg-[#F3F1EC]"
      role="img"
      aria-label="3D 인테리어 제안 렌더"
    >
      <Canvas
        gl={{ preserveDrawingBuffer: true }}
        camera={{ position: [dist, dist * 0.9, dist], fov: 45 }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[10, 14, 6]} intensity={0.9} />
        <Suspense fallback={null}>
          {scene.rooms.map((room, i) => {
            const px = room.x + room.w / 2 - cx;
            const pz = room.y + room.h / 2 - cz;
            const isBalcony = room.type === "balcony";
            return (
              <group key={i}>
                <mesh position={[px, 0, pz]}>
                  <boxGeometry args={[room.w, 0.05, room.h]} />
                  <meshStandardMaterial
                    color={isBalcony ? "#D9D6CE" : scene.floorColor}
                  />
                </mesh>
                {/* 외벽만 간략 표현: 북/서 벽 */}
                <mesh position={[px, WALL_H / 2, pz - room.h / 2]}>
                  <boxGeometry args={[room.w, WALL_H, WALL_T]} />
                  <meshStandardMaterial color={scene.wallColor} />
                </mesh>
                <mesh position={[px - room.w / 2, WALL_H / 2, pz]}>
                  <boxGeometry args={[WALL_T, WALL_H, room.h]} />
                  <meshStandardMaterial color={scene.wallColor} />
                </mesh>
              </group>
            );
          })}
          {scene.furniture.map((item, i) => (
            <Furniture key={i} item={item} cx={cx} cz={cz} />
          ))}
        </Suspense>
        <OrbitControls enableDamping dampingFactor={0.05} />
        <Snapshotter onSnapshot={onSnapshot} />
      </Canvas>
    </div>
  );
}
