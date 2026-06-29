"use client";

/**
 * components/proposal/presentation-view.tsx
 * 풀스크린 프레젠테이션 — 제안서 ↔ 평면도 토글 + PDF/인쇄 + 공유 링크 발급.
 */

import { useState } from "react";
import type { ApartmentTemplate, FinishSelection } from "@/lib/types";
import type { FurnishedScene } from "@/lib/studio/from-floorplan";
import { ProposalSheet } from "./proposal-sheet";
import { FloorplanSheet } from "./floorplan-sheet";

export interface PresentationData {
  proposalId: string;
  template: ApartmentTemplate;
  furnishedScene: FurnishedScene;
  finishes: FinishSelection[];
  materialsKRW: number;
  constructionKRW: number;
  totalKRW: number;
  customerName?: string;
}

export function PresentationView({ data }: { data: PresentationData }) {
  const [tab, setTab] = useState<"plan" | "proposal">("proposal");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const title = `${data.template.pyeongBand}평형 인테리어 제안`;

  async function onShare() {
    setShareError(null);
    const password = window.prompt("공유 비밀번호(4자 이상)를 입력하세요");
    if (!password || password.length < 4) {
      if (password !== null) setShareError("비밀번호는 4자 이상이어야 합니다.");
      return;
    }
    try {
      const res = await fetch(`/api/proposal/${data.proposalId}/share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, expiresInDays: 7, snapshot: snapshot ?? undefined }),
      });
      if (!res.ok) {
        setShareError("공유 링크 생성에 실패했습니다.");
        return;
      }
      const j = (await res.json()) as { shareUrl: string };
      setShareUrl(window.location.origin + j.shareUrl);
    } catch {
      setShareError("네트워크 오류가 발생했습니다.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button
          onClick={() => setTab("proposal")}
          className={`rounded-md px-4 py-2 text-sm ${
            tab === "proposal" ? "bg-ink text-white" : "bg-paper"
          }`}
        >
          제안서
        </button>
        <button
          onClick={() => setTab("plan")}
          className={`rounded-md px-4 py-2 text-sm ${
            tab === "plan" ? "bg-ink text-white" : "bg-paper"
          }`}
        >
          평면도
        </button>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => window.print()}
            className="rounded-md border border-hairline px-4 py-2 text-sm"
          >
            PDF/인쇄
          </button>
          <button
            onClick={onShare}
            className="rounded-md bg-brand px-4 py-2 text-sm text-white transition-colors hover:bg-brand-600"
          >
            공유 링크
          </button>
        </div>
      </div>
      {shareError && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 print:hidden">
          {shareError}
        </p>
      )}
      {shareUrl && (
        <p className="break-all rounded-md bg-paper p-3 text-sm print:hidden">
          공유 링크: {shareUrl}
        </p>
      )}
      <div className="print:block">
        {tab === "proposal" ? (
          <ProposalSheet
            scene={data.furnishedScene}
            finishes={data.finishes}
            materialsKRW={data.materialsKRW}
            constructionKRW={data.constructionKRW}
            totalKRW={data.totalKRW}
            title={title}
            onSnapshot={setSnapshot}
          />
        ) : (
          <FloorplanSheet
            template={data.template}
            title={`${data.template.pyeongBand}평 아파트 평면도`}
          />
        )}
      </div>
    </div>
  );
}
