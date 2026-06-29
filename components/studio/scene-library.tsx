"use client";

/**
 * components/studio/scene-library.tsx
 * "내 디자인" 모달 — 저장된 design_scenes 목록을 불러와 로드/삭제한다.
 * 비로그인(401) 시 안내. RLS가 본인 씬만 반환한다.
 */

import { useEffect, useState } from "react";

interface SceneSummary {
  id: string;
  name: string;
  domain: string;
  thumbnail_url: string | null;
  created_at: string;
}

export interface SceneLibraryProps {
  open: boolean;
  onClose: () => void;
  /** 선택한 씬 id를 부모로 전달(부모가 로드 수행). */
  onLoad: (id: string) => void;
}

export function SceneLibrary({ open, onClose, onLoad }: SceneLibraryProps) {
  const [scenes, setScenes] = useState<SceneSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setScenes(null);
    setError(null);

    (async () => {
      try {
        const res = await fetch("/api/studio/scenes");
        if (!res.ok) {
          if (!cancelled) {
            setError(res.status === 401 ? "로그인이 필요합니다." : "목록을 불러오지 못했습니다.");
          }
          return;
        }
        const json = (await res.json()) as { scenes?: SceneSummary[] };
        if (!cancelled) setScenes(json.scenes ?? []);
      } catch {
        if (!cancelled) setError("목록을 불러오지 못했습니다.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleDelete(id: string) {
    await fetch(`/api/studio/scenes/${id}`, { method: "DELETE" });
    setScenes((prev) => prev?.filter((s) => s.id !== id) ?? null);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="내 디자인"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-md overflow-auto rounded-lg bg-paper p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">내 디자인</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-hairline px-2 py-1 text-xs text-ink transition-colors hover:bg-muted"
          >
            닫기
          </button>
        </div>

        {error && <p className="py-8 text-center text-sm text-red-600">{error}</p>}
        {!error && scenes === null && (
          <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중…</p>
        )}
        {!error && scenes?.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">저장된 디자인이 없습니다.</p>
        )}

        <ul className="divide-y divide-hairline">
          {scenes?.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 py-2">
              <button
                type="button"
                onClick={() => onLoad(s.id)}
                className="flex-1 text-left"
              >
                <span className="block text-sm font-medium text-ink">{s.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {s.domain} · {new Date(s.created_at).toLocaleDateString("ko-KR")}
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleDelete(s.id)}
                className="rounded border border-hairline px-2 py-1 text-xs text-red-600 transition-colors hover:bg-muted"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
