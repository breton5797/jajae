/**
 * lib/studio/assets.ts — Studio asset catalog.
 * PURE: no three, no React imports.
 *
 * Each StudioAsset is a named assembly of GeoPart primitives.
 * scene-canvas.tsx interprets parts to build three.js geometry meshes.
 *
 * GeoPart.size meaning per prim:
 *   box      = [w, h, d]
 *   cylinder = [radius, height]
 *   cone     = [radius, height]
 *   sphere   = [radius]
 *   plane    = [w, h]
 */

import type { StudioDomain } from "@/lib/types";

// ─── Shape types ──────────────────────────────────────────────────────────────

export type GeoPrim = "box" | "cylinder" | "cone" | "sphere" | "plane";

export interface GeoPart {
  prim: GeoPrim;
  /**
   * size meaning per prim:
   *   box=[w,h,d]  cylinder=[radius,height]  cone=[radius,height]
   *   sphere=[radius]  plane=[w,h]
   */
  size: number[];
  /** Position of this part relative to the object's group origin. */
  offset?: [number, number, number];
  /** Optional per-part color override. Falls back to obj.color → DEFAULT_COLOR. */
  color?: string;
}

export interface StudioAsset {
  id: string;
  label: string;
  domains: StudioDomain[];
  parts: GeoPart[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALL_DOMAINS: StudioDomain[] = [
  "interior",
  "architecture",
  "landscape",
  "webtoon_bg",
  "stage",
  "signage",
  "furniture",
];

// ─── Asset catalog ────────────────────────────────────────────────────────────

export const ASSETS: StudioAsset[] = [
  // ── 가구/Furniture (furniture + interior) ─────────────────────────────────
  {
    id: "sofa",
    label: "소파",
    domains: ["furniture", "interior"],
    parts: [
      // seat base
      { prim: "box", size: [2, 0.4, 0.9], offset: [0, 0.2, 0] },
      // back rest
      { prim: "box", size: [2, 0.6, 0.25], offset: [0, 0.7, -0.325] },
    ],
  },
  {
    id: "table",
    label: "테이블",
    domains: ["furniture", "interior"],
    parts: [
      // tabletop
      { prim: "box", size: [1.6, 0.08, 0.9], offset: [0, 0.72, 0] },
      // four cylinder legs
      { prim: "cylinder", size: [0.05, 0.7], offset: [-0.7, 0.35, -0.35] },
      { prim: "cylinder", size: [0.05, 0.7], offset: [0.7, 0.35, -0.35] },
      { prim: "cylinder", size: [0.05, 0.7], offset: [-0.7, 0.35, 0.35] },
      { prim: "cylinder", size: [0.05, 0.7], offset: [0.7, 0.35, 0.35] },
    ],
  },
  {
    id: "chair",
    label: "의자",
    domains: ["furniture", "interior"],
    parts: [
      // seat
      { prim: "box", size: [0.55, 0.06, 0.55], offset: [0, 0.44, 0] },
      // back rest
      { prim: "box", size: [0.55, 0.5, 0.06], offset: [0, 0.75, -0.245] },
      // four legs
      { prim: "cylinder", size: [0.03, 0.44], offset: [-0.22, 0.22, -0.22] },
      { prim: "cylinder", size: [0.03, 0.44], offset: [0.22, 0.22, -0.22] },
      { prim: "cylinder", size: [0.03, 0.44], offset: [-0.22, 0.22, 0.22] },
      { prim: "cylinder", size: [0.03, 0.44], offset: [0.22, 0.22, 0.22] },
    ],
  },
  {
    id: "bed",
    label: "침대",
    domains: ["furniture", "interior"],
    parts: [
      // frame
      { prim: "box", size: [1.8, 0.3, 2.2], offset: [0, 0.15, 0] },
      // mattress
      { prim: "box", size: [1.6, 0.25, 1.9], offset: [0, 0.425, 0.1] },
      // headboard
      { prim: "box", size: [1.8, 0.5, 0.12], offset: [0, 0.55, -1.04] },
    ],
  },

  // ── 조경/Landscape ──────────────────────────────────────────────────────────
  {
    id: "tree",
    label: "나무",
    domains: ["landscape"],
    parts: [
      // trunk
      { prim: "cylinder", size: [0.15, 1.5], offset: [0, 0.75, 0], color: "#8B4513" },
      // foliage
      { prim: "cone", size: [0.7, 1.5], offset: [0, 2.25, 0], color: "#2D6A4F" },
    ],
  },
  {
    id: "bush",
    label: "관목",
    domains: ["landscape"],
    parts: [
      { prim: "sphere", size: [0.5], offset: [0, 0.5, 0], color: "#40916C" },
    ],
  },
  {
    id: "grass-patch",
    label: "잔디",
    domains: ["landscape"],
    parts: [
      // thin box so it lies flat without needing plane rotation
      { prim: "box", size: [2, 0.04, 2], offset: [0, 0.02, 0], color: "#52B788" },
    ],
  },

  // ── 무대/Stage ────────────────────────────────────────────────────────────
  {
    id: "platform",
    label: "무대 발판",
    domains: ["stage"],
    parts: [
      { prim: "box", size: [4, 0.3, 3], offset: [0, 0.15, 0] },
    ],
  },
  {
    id: "backdrop",
    label: "배경막",
    domains: ["stage"],
    parts: [
      // plane default orientation is vertical (XY plane) — correct for a backdrop
      { prim: "plane", size: [5, 3], offset: [0, 1.5, 0] },
    ],
  },
  {
    id: "prop-box",
    label: "소품 박스",
    domains: ["stage"],
    parts: [
      { prim: "box", size: [0.8, 0.8, 0.8], offset: [0, 0.4, 0] },
    ],
  },

  // ── 간판/Signage ──────────────────────────────────────────────────────────
  {
    id: "sign-panel",
    label: "간판",
    domains: ["signage"],
    parts: [
      // vertical post
      { prim: "cylinder", size: [0.05, 2.5], offset: [0, 1.25, 0] },
      // panel board
      { prim: "box", size: [1.6, 0.6, 0.05], offset: [0, 2.65, 0] },
    ],
  },

  // ── 건축/Architecture ────────────────────────────────────────────────────
  {
    id: "wall",
    label: "벽",
    domains: ["architecture", "interior"],
    parts: [
      { prim: "box", size: [4, 3, 0.2], offset: [0, 1.5, 0] },
    ],
  },
  {
    id: "slab",
    label: "슬래브",
    domains: ["architecture"],
    parts: [
      { prim: "box", size: [5, 0.25, 5], offset: [0, 0.125, 0] },
    ],
  },
  {
    id: "column",
    label: "기둥",
    domains: ["architecture"],
    parts: [
      { prim: "cylinder", size: [0.2, 3], offset: [0, 1.5, 0] },
    ],
  },

  // ── Primitives (all domains) ──────────────────────────────────────────────
  {
    id: "box",
    label: "박스",
    domains: ALL_DOMAINS,
    parts: [{ prim: "box", size: [1, 1, 1], offset: [0, 0.5, 0] }],
  },
  {
    id: "cylinder",
    label: "원기둥",
    domains: ALL_DOMAINS,
    parts: [{ prim: "cylinder", size: [0.5, 1], offset: [0, 0.5, 0] }],
  },
  {
    id: "cone",
    label: "원뿔",
    domains: ALL_DOMAINS,
    parts: [{ prim: "cone", size: [0.5, 1], offset: [0, 0.5, 0] }],
  },
  {
    id: "sphere",
    label: "구",
    domains: ALL_DOMAINS,
    parts: [{ prim: "sphere", size: [0.5], offset: [0, 0.5, 0] }],
  },
  {
    id: "plane",
    label: "평면",
    domains: ALL_DOMAINS,
    parts: [{ prim: "plane", size: [1, 1] }],
  },
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export function assetById(id: string): StudioAsset | undefined {
  return ASSETS.find((a) => a.id === id);
}

/**
 * Returns all assets available for the given domain.
 * Primitives (domains === ALL_DOMAINS) are always included.
 */
export function assetsForDomain(domain: StudioDomain): StudioAsset[] {
  return ASSETS.filter((a) => a.domains.includes(domain));
}
