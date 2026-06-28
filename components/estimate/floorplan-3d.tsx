"use client";

/**
 * components/estimate/floorplan-3d.tsx
 * Three.js 3D floor-plan preview via @react-three/fiber + drei.
 *
 * SSR safety: this file is "use client". The wizard page additionally loads it
 * with next/dynamic({ ssr: false }) to prevent any server-side import of Three.js.
 *
 * prefers-reduced-motion: auto-rotation is disabled when the media query matches.
 */

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useState } from "react";
import type { FloorPlan, FloorPlanRoom, RoomType } from "@/lib/types";

const WALL_HEIGHT = 2.4; // meters
const WALL_THICKNESS = 0.1; // meters

const ROOM_COLORS: Record<RoomType, string> = {
  living: "#B5C4D0",
  room: "#C4D0B5",
  bathroom: "#A8C5C0",
  kitchen: "#D0C4B5",
  balcony: "#C4D0CC",
  entrance: "#D0B5C4",
  other: "#D0D0D0",
};

interface RoomMeshProps {
  room: FloorPlanRoom;
  /** Plan center X (meters) — used to center the scene at origin. */
  cx: number;
  /** Plan center Z (meters, from Y in 2D) — used to center the scene at origin. */
  cz: number;
}

function RoomMesh({ room, cx, cz }: RoomMeshProps) {
  const color = ROOM_COLORS[room.type] ?? ROOM_COLORS.other;
  const px = room.x + room.w / 2 - cx;
  const pz = room.y + room.h / 2 - cz;
  const halfH = WALL_HEIGHT / 2;
  const halfW = room.w / 2;
  const halfD = room.h / 2;

  return (
    <group>
      {/* Floor slab */}
      <mesh position={[px, 0, pz]}>
        <boxGeometry args={[room.w, 0.05, room.h]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* North wall */}
      <mesh position={[px, halfH, pz - halfD]}>
        <boxGeometry args={[room.w, WALL_HEIGHT, WALL_THICKNESS]} />
        <meshStandardMaterial color="#E7E5E0" />
      </mesh>
      {/* South wall */}
      <mesh position={[px, halfH, pz + halfD]}>
        <boxGeometry args={[room.w, WALL_HEIGHT, WALL_THICKNESS]} />
        <meshStandardMaterial color="#E7E5E0" />
      </mesh>
      {/* West wall */}
      <mesh position={[px - halfW, halfH, pz]}>
        <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, room.h]} />
        <meshStandardMaterial color="#E7E5E0" />
      </mesh>
      {/* East wall */}
      <mesh position={[px + halfW, halfH, pz]}>
        <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, room.h]} />
        <meshStandardMaterial color="#E7E5E0" />
      </mesh>
    </group>
  );
}

export function FloorPlan3D({ plan }: { plan: FloorPlan }): JSX.Element {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (plan.rooms.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-hairline bg-paper text-sm text-muted-foreground">
        3D 미리보기 데이터가 없습니다
      </div>
    );
  }

  const cx = plan.widthM / 2;
  const cz = plan.lengthM / 2;
  const maxDim = Math.max(plan.widthM, plan.lengthM, 4);
  const camDist = maxDim * 1.6;

  return (
    <div
      className="h-64 w-full overflow-hidden rounded-lg border border-hairline"
      role="img"
      aria-label="3D 평면도 미리보기"
    >
      <Canvas
        frameloop="always"
        camera={{ position: [camDist, camDist * 0.8, camDist], fov: 50 }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 10, 5]} intensity={0.8} />
        <Suspense fallback={null}>
          {plan.rooms.map((room, i) => (
            <RoomMesh key={i} room={room} cx={cx} cz={cz} />
          ))}
        </Suspense>
        <OrbitControls
          autoRotate={!reducedMotion}
          autoRotateSpeed={0.5}
          enableDamping
          dampingFactor={0.05}
        />
      </Canvas>
    </div>
  );
}
