"use client";

/**
 * app/p/[token]/page.tsx
 * 공개 공유 페이지 — 비밀번호 폼 → POST /api/proposal/shared/[token] → 읽기 전용 제안 표시.
 * 만료/오답 시 한국어 안내. 인쇄 가능.
 */

import { useState } from "react";
import { MaterialPanel } from "@/components/proposal/material-panel";
import type { FinishSelection } from "@/lib/types";

interface Shared {
  customer_name: string | null;
  template_id: string;
  finishes: FinishSelection[];
  snapshot_url: string | null;
  materials_krw: number;
  construction_krw: number;
  total_krw: number;
}

export default function SharedProposalPage({
  params,
}: {
  params: { token: string };
}) {
  const [password, setPassword] = useState("");
  const [data, setData] = useState<Shared | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function open() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/proposal/shared/${params.token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setErr("비밀번호가 틀렸거나 만료된 링크입니다.");
        return;
      }
      setData((await res.json()) as Shared);
    } catch {
      setErr("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <main className="mx-auto flex max-w-sm flex-col gap-3 px-4 py-16">
        <h1 className="text-lg font-bold text-ink">인테리어 제안서 열람</h1>
        <p className="text-sm text-muted-foreground">
          공유받은 비밀번호를 입력하면 제안서를 확인할 수 있습니다.
        </p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") open();
          }}
          placeholder="공유 비밀번호"
          className="rounded-md border border-hairline p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button
          onClick={open}
          disabled={busy || password.length === 0}
          className="rounded-md bg-brand px-4 py-2 text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
        >
          {busy ? "확인 중..." : "열람"}
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-ink">인테리어 제안서</h1>
      {data.customer_name && (
        <p className="mb-4 text-sm text-muted-foreground">
          {data.customer_name} 고객님
        </p>
      )}
      {data.snapshot_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.snapshot_url}
          alt="3D 제안 렌더"
          className="mb-6 w-full rounded-xl border border-hairline"
        />
      )}
      <div className="rounded-2xl border border-hairline bg-white">
        <MaterialPanel
          finishes={data.finishes}
          materialsKRW={data.materials_krw}
          constructionKRW={data.construction_krw}
          totalKRW={data.total_krw}
        />
      </div>
    </main>
  );
}
