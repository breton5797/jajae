"use client";

/**
 * components/proposal/proposal-sheet.tsx
 * 이미지 #1 합성 — 좌: 3D 캔버스(hero), 우: 자재 패널, 하단: 특징 4컷.
 * 3D 캔버스는 next/dynamic({ ssr:false })로 로드(three.js 서버 임포트 차단).
 */

import dynamic from "next/dynamic";
import type { FinishSelection } from "@/lib/types";
import type { FurnishedScene } from "@/lib/studio/from-floorplan";
import { MaterialPanel } from "./material-panel";

const ProposalCanvas = dynamic(
  () => import("./proposal-canvas").then((m) => m.ProposalCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="aspect-[4/3] w-full animate-pulse rounded-xl bg-paper" />
    ),
  },
);

const HIGHLIGHTS = [
  { t: "넓고 효율적인 거실", d: "가족 모두가 편안하게 머무는 중심 공간" },
  { t: "실용적인 주방/식당", d: "동선을 고려한 효율적 주방 설계" },
  { t: "넉넉한 수납공간", d: "붙박이장과 팬트리로 깔끔한 수납" },
  { t: "밝고 쾌적한 공간", d: "남향 위주 배치와 넉넉한 채광" },
];

export function ProposalSheet({
  scene,
  finishes,
  materialsKRW,
  constructionKRW,
  totalKRW,
  title,
  onSnapshot,
}: {
  scene: FurnishedScene;
  finishes: FinishSelection[];
  materialsKRW: number;
  constructionKRW: number;
  totalKRW: number;
  title: string;
  onSnapshot?: (d: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6 rounded-2xl bg-white p-6 shadow-sm">
      <header>
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground">
          실용적인 동선과 감각적인 디자인의 조화
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <ProposalCanvas scene={scene} onSnapshot={onSnapshot} />
        <MaterialPanel
          finishes={finishes}
          materialsKRW={materialsKRW}
          constructionKRW={constructionKRW}
          totalKRW={totalKRW}
        />
      </div>
      <ul className="grid grid-cols-2 gap-4 border-t border-hairline pt-4 md:grid-cols-4">
        {HIGHLIGHTS.map((h) => (
          <li key={h.t}>
            <p className="font-semibold">{h.t}</p>
            <p className="text-xs text-muted-foreground">{h.d}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
