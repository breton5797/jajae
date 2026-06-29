import { describe, it, expect } from "vitest";
import {
  StudioRenderSchema,
  SaveScenePayloadSchema,
} from "@/lib/studio/schema";
import type { DesignScene } from "@/lib/types";

const validScene: DesignScene = {
  id: "scene-1",
  domain: "interior",
  objects: [
    {
      id: "obj-1",
      assetId: "sofa",
      name: "소파",
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    },
  ],
  ground: { type: "floor", sizeM: 10 },
  camera: { position: [5, 5, 5], target: [0, 0, 0] },
};

describe("StudioRenderSchema", () => {
  it("유효한 요청(imageBase64 + domain)을 통과시킨다", () => {
    const r = StudioRenderSchema.safeParse({
      imageBase64: "data:image/png;base64,AAAA",
      domain: "signage",
    });
    expect(r.success).toBe(true);
  });

  it("imageBase64 누락/공백을 거부한다", () => {
    expect(StudioRenderSchema.safeParse({ domain: "interior" }).success).toBe(false);
    expect(
      StudioRenderSchema.safeParse({ imageBase64: "", domain: "interior" }).success,
    ).toBe(false);
  });

  it("알 수 없는 도메인을 거부한다", () => {
    const r = StudioRenderSchema.safeParse({
      imageBase64: "data:image/png;base64,AAAA",
      domain: "spaceship",
    });
    expect(r.success).toBe(false);
  });
});

describe("SaveScenePayloadSchema", () => {
  it("유효한 저장 페이로드를 통과시킨다", () => {
    const r = SaveScenePayloadSchema.safeParse({
      name: "거실 시안 A",
      domain: "interior",
      scene: validScene,
    });
    expect(r.success).toBe(true);
  });

  it("빈 이름을 거부한다", () => {
    const r = SaveScenePayloadSchema.safeParse({
      name: "",
      domain: "interior",
      scene: validScene,
    });
    expect(r.success).toBe(false);
  });

  it("형식이 깨진 scene을 거부한다", () => {
    const r = SaveScenePayloadSchema.safeParse({
      name: "잘못된 씬",
      domain: "interior",
      scene: { id: "x" },
    });
    expect(r.success).toBe(false);
  });
});
