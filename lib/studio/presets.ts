/**
 * lib/studio/presets.ts — Domain presets.
 * PURE: no three, no React imports.
 *
 * Each preset defines default camera position/target and ground config
 * for a StudioDomain. Used by the toolbar domain switch to reconfigure
 * the DesignScene (camera + ground) without clearing existing objects.
 */

import type { StudioDomain } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StudioPreset {
  domain: StudioDomain;
  /** Korean display label shown in the toolbar select. */
  label: string;
  camera: {
    position: [number, number, number];
    target: [number, number, number];
  };
  ground: {
    type: "floor" | "terrain" | "none";
    sizeM: number;
  };
}

// ─── Preset catalog ───────────────────────────────────────────────────────────

export const PRESETS: Record<StudioDomain, StudioPreset> = {
  interior: {
    domain: "interior",
    label: "인테리어",
    camera: { position: [8, 6, 8], target: [0, 0, 0] },
    ground: { type: "floor", sizeM: 20 },
  },
  architecture: {
    domain: "architecture",
    label: "건축",
    camera: { position: [15, 12, 15], target: [0, 0, 0] },
    ground: { type: "floor", sizeM: 40 },
  },
  landscape: {
    domain: "landscape",
    label: "조경",
    camera: { position: [20, 15, 20], target: [0, 0, 0] },
    ground: { type: "terrain", sizeM: 40 },
  },
  webtoon_bg: {
    domain: "webtoon_bg",
    label: "웹툰 배경",
    camera: { position: [12, 8, 0], target: [0, 3, 0] },
    ground: { type: "floor", sizeM: 30 },
  },
  stage: {
    domain: "stage",
    label: "무대·세트",
    camera: { position: [10, 8, 12], target: [0, 1, 0] },
    ground: { type: "floor", sizeM: 30 },
  },
  signage: {
    domain: "signage",
    label: "간판",
    camera: { position: [6, 4, 6], target: [0, 1.5, 0] },
    ground: { type: "floor", sizeM: 15 },
  },
  furniture: {
    domain: "furniture",
    label: "가구",
    camera: { position: [5, 4, 5], target: [0, 0.5, 0] },
    ground: { type: "floor", sizeM: 10 },
  },
};

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export function presetForDomain(domain: StudioDomain): StudioPreset {
  return PRESETS[domain];
}
