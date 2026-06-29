import { describe, it, expect } from "vitest";
import { floorPlanToDesignScene } from "@/lib/studio/from-estimate";
import { presetForDomain } from "@/lib/studio/presets";
import type { FloorPlan } from "@/lib/types";

const plan: FloorPlan = {
  widthM: 8,
  lengthM: 6,
  rooms: [
    { name: "거실", type: "living", x: 0, y: 0, w: 5, h: 6 },
    { name: "안방", type: "room", x: 5, y: 0, w: 3, h: 3 },
    { name: "주방", type: "kitchen", x: 5, y: 3, w: 3, h: 3 },
    { name: "욕실", type: "bathroom", x: 0, y: 6, w: 2, h: 2 },
  ],
};

describe("floorPlanToDesignScene", () => {
  it("interior 도메인 + 프리셋 카메라, 평면도에 맞춘 바닥 크기", () => {
    const scene = floorPlanToDesignScene(plan);
    expect(scene.domain).toBe("interior");
    expect(scene.camera).toEqual(presetForDomain("interior").camera);
    expect(scene.ground.type).toBe("floor");
    expect(scene.ground.sizeM).toBe(8); // max(width, length)
  });

  it("룸마다 바닥 슬래브(box) + 타입별 기본 가구를 만든다", () => {
    const scene = floorPlanToDesignScene(plan);
    const floors = scene.objects.filter((o) => o.assetId === "box");
    expect(floors.length).toBe(4); // 룸 4개

    const furnitureIds = scene.objects
      .filter((o) => ["sofa", "bed", "table"].includes(o.assetId))
      .map((o) => o.assetId)
      .sort();
    // living→sofa, room→bed, kitchen→table, bathroom→없음
    expect(furnitureIds).toEqual(["bed", "sofa", "table"]);
    // 바닥 4 + 가구 3 + 외벽 4 = 11
    expect(scene.objects.length).toBe(11);
  });

  it("평면도 경계에 4면 외벽을 만든다", () => {
    const scene = floorPlanToDesignScene(plan);
    const walls = scene.objects.filter((o) => o.assetId === "wall");
    expect(walls.length).toBe(4);

    // 외벽은 평면도 경계(±width/2 x, ±length/2 z)에 위치. width=8,length=6.
    const positions = walls.map((w) => w.transform.position);
    expect(positions).toContainEqual([0, 0, -3]); // North
    expect(positions).toContainEqual([0, 0, 3]); // South
    expect(positions).toContainEqual([-4, 0, 0]); // West
    expect(positions).toContainEqual([4, 0, 0]); // East

    // x축 벽(N/S)은 폭에 맞춰 스케일, 회전 없음
    const northWall = walls.find((w) => w.transform.position[2] === -3)!;
    expect(northWall.transform.rotation[1]).toBe(0);
    expect(northWall.transform.scale[0]).toBe(2); // widthM/4 = 8/4

    // z축 벽(E/W)은 90도 회전 + 길이에 맞춰 스케일
    const westWall = walls.find((w) => w.transform.position[0] === -4)!;
    expect(westWall.transform.rotation[1]).toBeCloseTo(Math.PI / 2);
    expect(westWall.transform.scale[0]).toBe(1.5); // lengthM/4 = 6/4
  });

  it("바닥 슬래브는 룸 footprint로 스케일되고 원점 기준 중앙 정렬된다", () => {
    const scene = floorPlanToDesignScene(plan);
    // 거실: x0 y0 w5 h6 → 중앙 [2.5-4, 0, 3-3] = [-1.5, 0, 0], 스케일 [5, _, 6]
    const livingFloor = scene.objects.find(
      (o) => o.assetId === "box" && o.name.includes("거실"),
    );
    expect(livingFloor).toBeTruthy();
    expect(livingFloor!.transform.position).toEqual([-1.5, 0, 0]);
    expect(livingFloor!.transform.scale[0]).toBe(5);
    expect(livingFloor!.transform.scale[2]).toBe(6);
  });

  it("가구는 해당 룸 중앙에 배치된다", () => {
    const scene = floorPlanToDesignScene(plan);
    const sofa = scene.objects.find((o) => o.assetId === "sofa");
    expect(sofa!.transform.position).toEqual([-1.5, 0, 0]); // 거실 중앙
  });

  it("오브젝트 id는 결정론적이고 고유하다(obj-N)", () => {
    const scene = floorPlanToDesignScene(plan);
    const ids = scene.objects.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("obj-1");
    expect(ids[ids.length - 1]).toBe(`obj-${ids.length}`);
  });

  it("동일 입력 → 동일 출력(순수·결정론)", () => {
    expect(floorPlanToDesignScene(plan)).toEqual(floorPlanToDesignScene(plan));
  });
});
