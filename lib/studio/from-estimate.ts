/**
 * lib/studio/from-estimate.ts
 * 견적 평면도(FloorPlan) → 편집 가능한 DesignScene (순수·결정론).
 *
 * 룸마다 바닥 슬래브(box 프리미티브를 footprint로 스케일)를 만들고, 룸 타입별
 * 기본 가구를 중앙에 배치한다. 평면도는 원점 기준으로 중앙 정렬해 카메라 타깃(0,0,0)에
 * 맞춘다. 벽은 사용자가 팔레트(wall 에셋)로 추가한다.
 */
import { presetForDomain } from "@/lib/studio/presets";
import type { DesignScene, FloorPlan, RoomType, SceneObject, Transform3D } from "@/lib/types";

/** 룸 타입별 기본 가구 에셋(없는 타입은 가구 미배치). */
const ROOM_FURNITURE: Partial<Record<RoomType, string>> = {
  living: "sofa",
  room: "bed",
  kitchen: "table",
};

const FLOOR_COLOR = "#C7A878";
const FLOOR_THICKNESS = 0.1;
/** wall 에셋의 기본 x 길이(m) — 경계 외벽 스케일 계산 기준(assets.ts wall box size[0]). */
const WALL_UNIT = 4;

const identityScale = (): [number, number, number] => [1, 1, 1];
const noRotation = (): [number, number, number] => [0, 0, 0];

/** 견적 평면도를 편집 가능한 스튜디오 씬으로 변환. */
export function floorPlanToDesignScene(floorPlan: FloorPlan): DesignScene {
  const { widthM, lengthM, rooms } = floorPlan;
  const preset = presetForDomain("interior");

  // 원점 기준 중앙 정렬: 2D(x,y) → 3D(x,z), 평면도 중심을 (0,0)으로 이동.
  const centerOf = (
    r: FloorPlan["rooms"][number],
  ): [number, number, number] => [
    r.x + r.w / 2 - widthM / 2,
    0,
    r.y + r.h / 2 - lengthM / 2,
  ];

  const objects: SceneObject[] = [];
  let seq = 0;
  const nextId = (): string => `obj-${++seq}`;

  for (const room of rooms) {
    const center = centerOf(room);

    // 바닥 슬래브: 단위 box를 룸 footprint로 스케일.
    const floorTransform: Transform3D = {
      position: center,
      rotation: noRotation(),
      scale: [room.w, FLOOR_THICKNESS, room.h],
    };
    objects.push({
      id: nextId(),
      assetId: "box",
      name: `${room.name} 바닥`,
      transform: floorTransform,
      color: FLOOR_COLOR,
    });

    // 룸 타입별 기본 가구를 중앙에 배치.
    const furnitureAsset = ROOM_FURNITURE[room.type];
    if (furnitureAsset) {
      objects.push({
        id: nextId(),
        assetId: furnitureAsset,
        name: room.name,
        transform: {
          position: center,
          rotation: noRotation(),
          scale: identityScale(),
        },
      });
    }
  }

  // 평면도 경계 4면 외벽. wall 에셋은 x로 4m 길이 → 변 길이/4로 스케일.
  // N/S 벽은 x축(폭)을 따르고, E/W 벽은 90° 회전해 z축(길이)을 따른다.
  const WALL_W = widthM / WALL_UNIT;
  const WALL_L = lengthM / WALL_UNIT;
  const perimeter: Array<{ pos: [number, number, number]; rotY: number; len: number }> = [
    { pos: [0, 0, -lengthM / 2], rotY: 0, len: WALL_W }, // North
    { pos: [0, 0, lengthM / 2], rotY: 0, len: WALL_W }, // South
    { pos: [-widthM / 2, 0, 0], rotY: Math.PI / 2, len: WALL_L }, // West
    { pos: [widthM / 2, 0, 0], rotY: Math.PI / 2, len: WALL_L }, // East
  ];
  for (const w of perimeter) {
    objects.push({
      id: nextId(),
      assetId: "wall",
      name: "외벽",
      transform: {
        position: w.pos,
        rotation: [0, w.rotY, 0],
        scale: [w.len, 1, 1],
      },
    });
  }

  return {
    id: "scene-estimate",
    domain: "interior",
    objects,
    ground: { type: "floor", sizeM: Math.max(widthM, lengthM) },
    camera: preset.camera,
  };
}
