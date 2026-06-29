"use client";

/**
 * components/studio/asset-palette.tsx
 * Sidebar listing all StudioAssets available for the current domain.
 * Click → onAdd(asset) which the parent resolves to addObject().
 */

import type { StudioDomain } from "@/lib/types";
import { assetsForDomain, type StudioAsset } from "@/lib/studio/assets";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AssetPaletteProps {
  domain: StudioDomain;
  /** Parent calls addObject with asset.id + asset.label. */
  onAdd: (asset: StudioAsset) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AssetPalette({ domain, onAdd }: AssetPaletteProps) {
  const assets = assetsForDomain(domain);

  return (
    <aside
      className="flex w-44 flex-col overflow-y-auto border-r border-hairline bg-paper"
      aria-label="에셋 팔레트"
    >
      <div className="border-b border-hairline px-3 py-2">
        <p className="text-xs font-semibold text-muted-foreground">에셋</p>
      </div>

      <ul className="flex flex-col gap-0.5 p-2">
        {assets.map((asset) => (
          <li key={asset.id}>
            <button
              type="button"
              onClick={() => onAdd(asset)}
              className="w-full rounded px-2 py-1.5 text-left text-sm text-ink transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {asset.label}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
