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

// 돌하우스(dollhouse) 뷰: 벽을 낮춰 위에서 비스듬히 내부가 보이도록.
const WALL_H = 1.3;
const WALL_T = 0.1;
const FURNITURE_COLOR = "#9A8C7A";

function Part({ part, color }: { part: GeoPart; color: string }) {
  const [ox, oy, oz] = part.offset ?? [0, 0, 0];
  const c = part.color ?? color;
  return (
    <mesh position={[ox, oy, oz]} castShadow receiveShadow>
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
    <group
      position={[x - cx, 0, z - cz]}
      rotation={item.transform.rotation}
      scale={item.transform.scale}
    >
      {item.asset.parts.map((p, i) => (
        <Part key={i} part={p} color={FURNITURE_COLOR} />
      ))}
    </group>
  );
}

/** 한 방의 바닥 + 4면 벽(돌하우스 높이). */
function Room({
  room,
  px,
  pz,
  floorColor,
  wallColor,
}: {
  room: { w: number; h: number; type: string };
  px: number;
  pz: number;
  floorColor: string;
  wallColor: string;
}) {
  const isBalcony = room.type === "balcony";
  const hw = room.w / 2;
  const hd = room.h / 2;
  return (
    <group>
      {/* 바닥 슬래브 */}
      <mesh position={[px, 0, pz]} receiveShadow>
        <boxGeometry args={[room.w, 0.05, room.h]} />
        <meshStandardMaterial color={isBalcony ? "#D9D6CE" : floorColor} />
      </mesh>
      {/* 4면 벽 (북/남/서/동) */}
      <mesh position={[px, WALL_H / 2, pz - hd]} castShadow receiveShadow>
        <boxGeometry args={[room.w, WALL_H, WALL_T]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      <mesh position={[px, WALL_H / 2, pz + hd]} castShadow receiveShadow>
        <boxGeometry args={[room.w, WALL_H, WALL_T]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      <mesh position={[px - hw, WALL_H / 2, pz]} castShadow receiveShadow>
        <boxGeometry args={[WALL_T, WALL_H, room.h]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      <mesh position={[px + hw, WALL_H / 2, pz]} castShadow receiveShadow>
        <boxGeometry args={[WALL_T, WALL_H, room.h]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
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
  const span = Math.max(scene.widthM, scene.lengthM, 6);
  const dist = span * 1.5;
  const shadowExtent = span; // 직교 그림자 카메라 절두체 반경

  return (
    <div
      className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-hairline bg-[#F3F1EC]"
      role="img"
      aria-label="3D 인테리어 제안 렌더"
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        camera={{ position: [dist * 0.85, dist * 1.05, dist * 0.85], fov: 40 }}
      >
        <color attach="background" args={["#F3F1EC"]} />
        <ambientLight intensity={0.5} />
        <hemisphereLight args={["#ffffff", "#d8d2c6", 0.55]} />
        <directionalLight
          position={[dist * 0.6, dist * 1.2, dist * 0.4]}
          intensity={1.15}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-shadowExtent}
          shadow-camera-right={shadowExtent}
          shadow-camera-top={shadowExtent}
          shadow-camera-bottom={-shadowExtent}
          shadow-camera-near={0.5}
          shadow-camera-far={dist * 3}
          shadow-bias={-0.0005}
        />
        <Suspense fallback={null}>
          {/* 그림자 받는 베이스 */}
          <mesh position={[0, -0.04, 0]} receiveShadow>
            <boxGeometry args={[scene.widthM + 2, 0.02, scene.lengthM + 2]} />
            <meshStandardMaterial color="#E7E3DA" />
          </mesh>
          {scene.rooms.map((room, i) => (
            <Room
              key={i}
              room={room}
              px={room.x + room.w / 2 - cx}
              pz={room.y + room.h / 2 - cz}
              floorColor={scene.floorColor}
              wallColor={scene.wallColor}
            />
          ))}
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
