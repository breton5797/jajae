"use client";

/**
 * components/proposal/proposal-sheet.tsx
 * 이미지 #1 합성 — 좌: 3D 캔버스(hero), 우: 자재 패널, 하단: 특징 4컷.
 * 3D 캔버스는 next/dynamic({ ssr:false })로 로드(three.js 서버 임포트 차단).
 * "AI 실사 변환": 3D 스냅샷을 /api/proposal/render 로 보내 포토리얼 이미지로 교체
 * (키 미설정 시 원본 3D 렌더 유지 — graceful fallback).
 */

import dynamic from "next/dynamic";
import { useState } from "react";
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
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [aiImage, setAiImage] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const handleSnapshot = (d: string) => {
    setSnapshot(d);
    onSnapshot?.(d);
  };

  const beautify = async () => {
    if (!snapshot || aiBusy) return;
    setAiBusy(true);
    setAiNote(null);
    try {
      const res = await fetch("/api/proposal/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64: snapshot }),
      });
      if (!res.ok) {
        setAiNote("AI 실사 변환에 실패했습니다 — 원본 3D 렌더를 유지합니다.");
        return;
      }
      const j = (await res.json()) as { imageUrl: string; mock: boolean; note?: string };
      setAiImage(j.imageUrl);
      if (j.mock && j.note) setAiNote(j.note);
    } catch {
      setAiNote("AI 실사 변환 중 오류가 발생했습니다 — 원본 3D 렌더를 유지합니다.");
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 rounded-2xl bg-white p-6 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">
            실용적인 동선과 감각적인 디자인의 조화
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          {aiImage && (
            <button
              type="button"
              onClick={() => setAiImage(null)}
              className="rounded-md border border-hairline px-3 py-1.5 text-sm"
            >
              3D로 보기
            </button>
          )}
          <button
            type="button"
            onClick={beautify}
            disabled={!snapshot || aiBusy}
            className="rounded-md bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {aiBusy ? "변환 중…" : "AI 실사 변환"}
          </button>
        </div>
      </header>
      {aiNote && (
        <p className="rounded-md bg-paper px-3 py-2 text-xs text-muted-foreground print:hidden">
          {aiNote}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="relative">
          {aiImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={aiImage}
              alt="AI 실사 인테리어 제안 렌더"
              className="aspect-[4/3] w-full rounded-xl border border-hairline object-cover"
            />
          ) : (
            <ProposalCanvas scene={scene} onSnapshot={handleSnapshot} />
          )}
          {aiBusy && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/30 text-sm font-medium text-white">
              AI 실사 렌더 생성 중…
            </div>
          )}
        </div>
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
