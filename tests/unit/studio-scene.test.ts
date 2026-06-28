import { describe, it, expect } from "vitest";
import {
  emptyScene,
  addObject,
  removeObject,
  updateObject,
  moveObject,
} from "@/lib/studio/scene";
import type { StudioDomain, Transform3D } from "@/lib/types";

const DOMAIN: StudioDomain = "interior";

describe("emptyScene", () => {
  it("objects 배열이 비어 있다", () => {
    const scene = emptyScene(DOMAIN);
    expect(scene.objects).toEqual([]);
  });

  it("ground.type=floor, ground.sizeM=20", () => {
    const scene = emptyScene(DOMAIN);
    expect(scene.ground.type).toBe("floor");
    expect(scene.ground.sizeM).toBe(20);
  });

  it("카메라 기본값: position [8,6,8], target [0,0,0]", () => {
    const scene = emptyScene(DOMAIN);
    expect(scene.camera.position).toEqual([8, 6, 8]);
    expect(scene.camera.target).toEqual([0, 0, 0]);
  });

  it("domain과 id가 올바르게 설정된다", () => {
    const scene = emptyScene(DOMAIN);
    expect(scene.domain).toBe(DOMAIN);
    expect(scene.id).toBe(`scene-${DOMAIN}`);
  });
});

describe("addObject", () => {
  it("첫 번째 객체: id=obj-1로 추가된다", () => {
    const scene = emptyScene(DOMAIN);
    const next = addObject(scene, "box", "Box1");
    expect(next.objects).toHaveLength(1);
    expect(next.objects[0]!.id).toBe("obj-1");
  });

  it("두 번째 객체: id=obj-2로 추가된다", () => {
    const scene = emptyScene(DOMAIN);
    const s1 = addObject(scene, "box", "Box1");
    const s2 = addObject(s1, "cylinder", "Cyl1");
    expect(s2.objects).toHaveLength(2);
    expect(s2.objects[1]!.id).toBe("obj-2");
  });

  it("불변성: 원본 scene.objects 길이가 변하지 않는다", () => {
    const scene = emptyScene(DOMAIN);
    addObject(scene, "box", "Box1");
    expect(scene.objects).toHaveLength(0);
  });

  it("transform 생략 시 identity transform이 기본값으로 설정된다", () => {
    const scene = emptyScene(DOMAIN);
    const next = addObject(scene, "box", "Box1");
    expect(next.objects[0]!.transform).toEqual({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });
  });

  it("transform 제공 시 해당 transform이 사용된다", () => {
    const scene = emptyScene(DOMAIN);
    const t: Transform3D = {
      position: [1, 2, 3],
      rotation: [0, 0, 0],
      scale: [2, 2, 2],
    };
    const next = addObject(scene, "box", "Box1", t);
    expect(next.objects[0]!.transform).toEqual(t);
  });
});

describe("removeObject", () => {
  it("일치하는 id의 객체를 제거한다", () => {
    const scene = emptyScene(DOMAIN);
    const s1 = addObject(scene, "box", "Box1");
    const s2 = removeObject(s1, "obj-1");
    expect(s2.objects).toHaveLength(0);
  });

  it("존재하지 않는 id는 no-op (길이 유지)", () => {
    const scene = emptyScene(DOMAIN);
    const s1 = addObject(scene, "box", "Box1");
    const s2 = removeObject(s1, "unknown-id");
    expect(s2.objects).toHaveLength(1);
  });

  it("불변성: 원본 scene은 변하지 않는다", () => {
    const scene = emptyScene(DOMAIN);
    const s1 = addObject(scene, "box", "Box1");
    removeObject(s1, "obj-1");
    expect(s1.objects).toHaveLength(1);
  });
});

describe("updateObject", () => {
  it("color 필드를 패치한다", () => {
    const scene = emptyScene(DOMAIN);
    const s1 = addObject(scene, "box", "Box1");
    const s2 = updateObject(s1, "obj-1", { color: "#ff0000" });
    expect(s2.objects[0]!.color).toBe("#ff0000");
  });

  it("transform deep-merge: position만 패치하면 rotation/scale이 보존된다", () => {
    const scene = emptyScene(DOMAIN);
    const initial: Transform3D = {
      position: [0, 0, 0],
      rotation: [1, 0, 0],
      scale: [2, 2, 2],
    };
    const s1 = addObject(scene, "box", "Box1", initial);
    // 런타임에서는 partial transform도 올바르게 merge됨 (implementation: {...obj.transform, ...patch.transform})
    const s2 = updateObject(s1, "obj-1", {
      transform: { position: [5, 5, 5] } as unknown as Transform3D,
    });
    expect(s2.objects[0]!.transform.position).toEqual([5, 5, 5]);
    expect(s2.objects[0]!.transform.rotation).toEqual([1, 0, 0]);
    expect(s2.objects[0]!.transform.scale).toEqual([2, 2, 2]);
  });

  it("불변성: 원본 scene은 변하지 않는다", () => {
    const scene = emptyScene(DOMAIN);
    const s1 = addObject(scene, "box", "Box1");
    updateObject(s1, "obj-1", { color: "#ff0000" });
    expect(s1.objects[0]!.color).toBeUndefined();
  });
});

describe("moveObject", () => {
  it("position이 새 값으로 설정된다", () => {
    const scene = emptyScene(DOMAIN);
    const s1 = addObject(scene, "box", "Box1");
    const s2 = moveObject(s1, "obj-1", [3, 4, 5]);
    expect(s2.objects[0]!.transform.position).toEqual([3, 4, 5]);
  });

  it("rotation과 scale은 변하지 않는다", () => {
    const scene = emptyScene(DOMAIN);
    const initial: Transform3D = {
      position: [0, 0, 0],
      rotation: [0, 1, 0],
      scale: [3, 3, 3],
    };
    const s1 = addObject(scene, "box", "Box1", initial);
    const s2 = moveObject(s1, "obj-1", [10, 0, 0]);
    expect(s2.objects[0]!.transform.rotation).toEqual([0, 1, 0]);
    expect(s2.objects[0]!.transform.scale).toEqual([3, 3, 3]);
  });
});
