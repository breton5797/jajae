import { describe, it, expect } from "vitest";
import { ASSETS, assetById, assetsForDomain } from "@/lib/studio/assets";
import { PRESETS, presetForDomain } from "@/lib/studio/presets";
import type { StudioDomain } from "@/lib/types";

const VALID_PRIMS = new Set(["box", "cylinder", "cone", "sphere", "plane"]);

const ALL_DOMAINS: StudioDomain[] = [
  "interior",
  "architecture",
  "landscape",
  "webtoon_bg",
  "stage",
  "signage",
  "furniture",
];

describe("ASSETS 카탈로그", () => {
  it("ASSETS 배열이 비어 있지 않다", () => {
    expect(ASSETS.length).toBeGreaterThan(0);
  });

  it("모든 에셋에 id, label, ≥1 part가 있다", () => {
    for (const asset of ASSETS) {
      expect(typeof asset.id).toBe("string");
      expect(asset.id.length).toBeGreaterThan(0);
      expect(typeof asset.label).toBe("string");
      expect(asset.label.length).toBeGreaterThan(0);
      expect(asset.parts.length).toBeGreaterThan(0);
    }
  });

  it("모든 part.prim이 유효한 GeoPrim이다", () => {
    for (const asset of ASSETS) {
      for (const part of asset.parts) {
        expect(VALID_PRIMS.has(part.prim)).toBe(true);
      }
    }
  });

  it("모든 part.size가 non-empty number[]이다", () => {
    for (const asset of ASSETS) {
      for (const part of asset.parts) {
        expect(Array.isArray(part.size)).toBe(true);
        expect(part.size.length).toBeGreaterThan(0);
        for (const n of part.size) {
          expect(typeof n).toBe("number");
        }
      }
    }
  });
});

describe("assetById", () => {
  it("알려진 id(box)에 대해 올바른 에셋을 반환한다", () => {
    const asset = assetById("box");
    expect(asset).toBeDefined();
    expect(asset!.id).toBe("box");
  });

  it("알려진 id(sofa)에 대해 올바른 에셋을 반환한다", () => {
    const asset = assetById("sofa");
    expect(asset).toBeDefined();
    expect(asset!.id).toBe("sofa");
  });

  it("알 수 없는 id에 대해 undefined를 반환한다", () => {
    expect(assetById("nonexistent-asset-xyz")).toBeUndefined();
  });
});

describe("assetsForDomain", () => {
  it.each(ALL_DOMAINS)("도메인 '%s' → non-empty 목록", (domain) => {
    const list = assetsForDomain(domain);
    expect(list.length).toBeGreaterThan(0);
  });

  it.each(ALL_DOMAINS)(
    "도메인 '%s': 반환된 에셋이 실제로 해당 도메인을 포함한다",
    (domain) => {
      const list = assetsForDomain(domain);
      for (const asset of list) {
        expect(asset.domains).toContain(domain);
      }
    },
  );

  it("primitives(box/cylinder 등)는 모든 도메인에 포함된다", () => {
    for (const domain of ALL_DOMAINS) {
      const list = assetsForDomain(domain);
      const ids = list.map((a) => a.id);
      expect(ids).toContain("box");
      expect(ids).toContain("cylinder");
    }
  });
});

describe("PRESETS / presetForDomain", () => {
  it("7개 도메인 모두 프리셋이 존재한다", () => {
    for (const domain of ALL_DOMAINS) {
      expect(PRESETS[domain]).toBeDefined();
    }
  });

  it("모든 프리셋에 camera.position(3요소)과 camera.target(3요소)이 있다", () => {
    for (const domain of ALL_DOMAINS) {
      const preset = PRESETS[domain];
      expect(preset!.camera.position).toHaveLength(3);
      expect(preset!.camera.target).toHaveLength(3);
    }
  });

  it("모든 프리셋에 ground.type(string)과 ground.sizeM(number)이 있다", () => {
    for (const domain of ALL_DOMAINS) {
      const preset = PRESETS[domain];
      expect(typeof preset!.ground.type).toBe("string");
      expect(typeof preset!.ground.sizeM).toBe("number");
    }
  });

  it.each(ALL_DOMAINS)(
    "presetForDomain('%s')이 올바른 프리셋을 반환한다",
    (domain) => {
      const preset = presetForDomain(domain);
      expect(preset.domain).toBe(domain);
    },
  );
});
